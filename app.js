import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendPasswordResetEmail as resetPassword
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";


/* =========================================================
   FIREBASE
========================================================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* =========================================================
   VARIÁVEIS
========================================================= */

let expensesChart = null;

const defaultCategories = [
  "Alimentação",
  "Roupas",
  "Acessórios",
  "Moto",
  "Transporte",
  "Lazer",
  "Tecnologia",
  "Casa",
  "Estudos",
  "Saúde",
  "Contas",
  "Outros"
];

let user = null;

let transactions = [];
let categories = [];
let goals = [];
let fixedExpenses = [];

let unsubscribers = [];

let currentPage = "dashboard";

let selectedMonth = new Date().toISOString().slice(0, 7);


/* =========================================================
   HELPERS
========================================================= */

const $ = id => document.getElementById(id);

const money = n =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

const today = () =>
  new Date().toISOString().slice(0, 10);

const monthOf = date =>
  String(date || "").slice(0, 7);


function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    m => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m])
  );
}


function showToast(msg, type = "ok") {

  const el = $("toast");

  if (!el) return;

  el.textContent = msg;

  el.className = `toast show ${type}`;

  setTimeout(() => {
    el.className = "toast";
  }, 3000);
}


function setLoading(show) {

  const loading = $("loading");

  if (!loading) return;

  loading.classList.toggle("hidden", !show);
}


function userRef() {

  return doc(
    db,
    "users",
    user.uid
  );

}


function sub(name) {

  return collection(
    db,
    "users",
    user.uid,
    name
  );

}


/* =========================================================
   MODAIS
========================================================= */

function openModal(id) {

  const modal = $(id);

  if (!modal) return;

  modal.classList.remove("hidden");

}


function closeModal(modal) {

  if (!modal) return;

  modal.classList.add("hidden");

}


function closeAllModals() {

  document
    .querySelectorAll(".modal")
    .forEach(modal => {
      modal.classList.add("hidden");
    });

}


/* =========================================================
   AUTH
========================================================= */

function renderAuthTab(tab) {

  document
    .querySelectorAll(".auth-tabs .tab")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.authTab === tab
      );

    });


  if ($("loginForm")) {

    $("loginForm").classList.toggle(
      "hidden",
      tab !== "login"
    );

  }


  if ($("registerForm")) {

    $("registerForm").classList.toggle(
      "hidden",
      tab !== "register"
    );

  }


  if ($("authMessage")) {

    $("authMessage").textContent = "";

  }

}


function firebaseError(e) {

  const map = {

    "auth/invalid-credential":
      "E-mail ou senha incorretos.",

    "auth/email-already-in-use":
      "Este e-mail já está cadastrado.",

    "auth/invalid-email":
      "Digite um e-mail válido.",

    "auth/weak-password":
      "A senha precisa ter pelo menos 6 caracteres.",

    "auth/too-many-requests":
      "Muitas tentativas. Tente novamente mais tarde.",

    "auth/network-request-failed":
      "Sem conexão com a internet."

  };

  return (
    map[e.code] ||
    e.message ||
    "Ocorreu um erro."
  );

}


/* =========================================================
   PERFIL
========================================================= */

async function ensureProfile() {

  const ref = userRef();

  const snap = await getDoc(ref);

  if (!snap.exists()) {

    await setDoc(
      ref,
      {
        name: user.displayName || "Usuário",
        email: user.email,
        createdAt: serverTimestamp()
      }
    );

  }

}


/* =========================================================
   FIRESTORE
========================================================= */

function listenData() {

  unsubscribers.forEach(fn => fn());

  unsubscribers = [];


  const listen = (
    name,
    setter,
    sortField = "createdAt"
  ) => {

    const q = query(
      sub(name),
      orderBy(sortField, "desc")
    );


    const unsub = onSnapshot(
      q,

      snapshot => {

        setter(
          snapshot.docs.map(
            d => ({
              id: d.id,
              ...d.data()
            })
          )
        );

        renderAll();

      },

      error => {

        console.error(
          `Erro ao carregar ${name}:`,
          error
        );


        const fallback = onSnapshot(
          sub(name),

          snapshot => {

            setter(
              snapshot.docs.map(
                d => ({
                  id: d.id,
                  ...d.data()
                })
              )
            );

            renderAll();

          }

        );

        unsubscribers.push(fallback);

      }

    );

    unsubscribers.push(unsub);

  };


  listen(
    "transactions",
    value => transactions = value
  );


  listen(
    "goals",
    value => goals = value
  );


  listen(
    "fixedExpenses",
    value => fixedExpenses = value
  );


  const categoryUnsub = onSnapshot(
    sub("categories"),

    snapshot => {

      categories =
        snapshot.docs.map(
          d => ({
            id: d.id,
            ...d.data()
          })
        );


      if (!categories.length) {

        seedCategories();

      }


      renderAll();

    }

  );


  unsubscribers.push(
    categoryUnsub
  );

}


async function seedCategories() {

  if (!user) return;


  const batch = writeBatch(db);


  defaultCategories.forEach(
    name => {

      batch.set(
        doc(sub("categories")),
        {
          name,
          createdAt: serverTimestamp()
        }
      );

    }
  );


  await batch.commit();

}


/* =========================================================
   LOGIN / LOGOUT
========================================================= */

onAuthStateChanged(
  auth,
  async u => {

    setLoading(true);


    try {

      if (u) {

        user = u;


        await ensureProfile();


        if ($("authView")) {

          $("authView")
            .classList
            .add("hidden");

        }


        if ($("appView")) {

          $("appView")
            .classList
            .remove("hidden");

        }


        if ($("userMini")) {

          $("userMini").innerHTML = `
            <strong>
              ${escapeHtml(
                u.displayName ||
                "Usuário"
              )}
            </strong>

            <small>
              ${escapeHtml(
                u.email || ""
              )}
            </small>
          `;

        }


        if ($("welcomeText")) {

          $("welcomeText").textContent =
            `Olá, ${u.displayName || "usuário"}!`;

        }


        if ($("accountInfo")) {

          $("accountInfo").textContent =
            `Conta: ${u.email}`;

        }


        if ($("monthFilter")) {

          if (!$("monthFilter").value) {

            $("monthFilter").value =
              selectedMonth;

          }

        }


        /*
          Depois do login:
          mostra somente a tela de escolha.
        */

        if ($("homeView")) {

          $("homeView")
            .classList
            .remove("hidden");

        }


        document
          .querySelectorAll(".page")
          .forEach(page => {

            page.classList.add("hidden");

          });


        closeMobileMenu();


        listenData();


      } else {

        user = null;

        transactions = [];
        goals = [];
        categories = [];
        fixedExpenses = [];


        if ($("appView")) {

          $("appView")
            .classList
            .add("hidden");

        }


        if ($("authView")) {

          $("authView")
            .classList
            .remove("hidden");

        }


        if ($("homeView")) {

          $("homeView")
            .classList
            .add("hidden");

        }

      }


    } catch (error) {

      console.error(
        "Erro ao iniciar o sistema:",
        error
      );

    } finally {

      setLoading(false);

    }

  }
);


/* =========================================================
   FORM LOGIN
========================================================= */

if ($("loginForm")) {

  $("loginForm").addEventListener(
    "submit",
    async e => {

      e.preventDefault();

      $("authMessage").textContent =
        "Entrando...";


      try {

        await signInWithEmailAndPassword(
          auth,
          $("loginEmail").value,
          $("loginPassword").value
        );

      } catch (err) {

        $("authMessage").textContent =
          firebaseError(err);

      }

    }
  );

}


/* =========================================================
   FORM CADASTRO
========================================================= */

if ($("registerForm")) {

  $("registerForm").addEventListener(
    "submit",
    async e => {

      e.preventDefault();

      $("authMessage").textContent =
        "Criando conta...";


      try {

        const cred =
          await createUserWithEmailAndPassword(
            auth,
            $("registerEmail").value,
            $("registerPassword").value
          );


        await setDoc(
          doc(
            db,
            "users",
            cred.user.uid
          ),

          {
            name:
              $("registerName")
                .value
                .trim(),

            email:
              cred.user.email,

            createdAt:
              serverTimestamp()
          }
        );


      } catch (err) {

        $("authMessage").textContent =
          firebaseError(err);

      }

    }
  );

}


/* =========================================================
   RECUPERAR SENHA
========================================================= */

if ($("forgotPassword")) {

  $("forgotPassword").onclick =
    async () => {

      const email =
        $("loginEmail")
          .value
          .trim();


      if (!email) {

        $("authMessage").textContent =
          "Digite seu e-mail primeiro.";

        return;

      }


      try {

        await sendPasswordResetEmail(
          auth,
          email
        );


        $("authMessage").textContent =
          "E-mail de recuperação enviado.";

      } catch (e) {

        $("authMessage").textContent =
          firebaseError(e);

      }

    };

}


/* =========================================================
   LOGOUT
========================================================= */

if ($("logoutBtn")) {

  $("logoutBtn").onclick =
    () => signOut(auth);

}


/* =========================================================
   ABAS DE LOGIN
========================================================= */

document
  .querySelectorAll("[data-auth-tab]")
  .forEach(button => {

    button.onclick = () =>
      renderAuthTab(
        button.dataset.authTab
      );

  });


/* =========================================================
   FINANCEIRO
========================================================= */

function getTypeLabel(type) {

  return {

    income: "Entrada",

    expense: "Gasto",

    save: "Guardou",

    withdraw:
      "Retirou da reserva"

  }[type] || type;

}


function signedAmount(type, value) {

  return (
    type === "income" ||
    type === "withdraw"
  )
    ? Number(value)
    : -Number(value);

}


function monthTransactions() {

  return transactions.filter(
    t =>
      monthOf(t.date) ===
      selectedMonth
  );

}


function totalSaved() {

  return transactions.reduce(
    (total, transaction) => {

      if (
        transaction.type ===
        "save"
      ) {

        return total +
          Number(
            transaction.amount
          );

      }


      if (
        transaction.type ===
        "withdraw"
      ) {

        return total -
          Number(
            transaction.amount
          );

      }


      return total;

    },

    0
  );

}


function totalBalance() {

  return transactions.reduce(
    (total, transaction) => {

      return total +
        signedAmount(
          transaction.type,
          transaction.amount
        );

    },

    0
  );

}


/* =========================================================
   RENDER GERAL
========================================================= */

function renderAll() {

  renderDashboard();

  renderTransactions();

  renderGoals();

  renderSettings();

  populateCategories();

}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

  const mt =
    monthTransactions();


  const income =
    mt
      .filter(
        t =>
          t.type === "income"
      )
      .reduce(
        (a, t) =>
          a +
          Number(t.amount),
        0
      );


  const expenses =
    mt
      .filter(
        t =>
          t.type === "expense"
      )
      .reduce(
        (a, t) =>
          a +
          Number(t.amount),
        0
      );


  if ($("balance")) {

    $("balance").textContent =
      money(totalBalance());

  }


  if ($("saved")) {

    $("saved").textContent =
      money(totalSaved());

  }


  if ($("income")) {

    $("income").textContent =
      money(income);

  }


  if ($("expenses")) {

    $("expenses").textContent =
      money(expenses);

  }


  renderExpensesChart(mt);


  const by = {};


  mt
    .filter(
      t =>
        t.type === "expense"
    )
    .forEach(t => {

      const category =
        t.category ||
        "Outros";


      by[category] =
        (by[category] || 0) +
        Number(t.amount);

    });


  const entries =
    Object.entries(by)
      .sort(
        (a, b) =>
          b[1] - a[1]
      );


  if ($("categoryChart")) {

    $("categoryChart").className =
      entries.length
        ? "bar-chart"
        : "bar-chart empty-state";


    $("categoryChart").innerHTML =
      entries.length

        ? entries
            .map(
              ([name, value]) => {

                const max =
                  entries[0][1] ||
                  1;


                return `
                  <div class="bar-row">

                    <div>
                      <span>
                        ${escapeHtml(name)}
                      </span>

                      <strong>
                        ${money(value)}
                      </strong>
                    </div>

                    <div class="bar">
                      <i
                        style="
                          width:
                          ${Math.max(
                            3,
                            value /
                            max *
                            100
                          )}%
                        "
                      ></i>
                    </div>

                  </div>
                `;

              }
            )
            .join("")

        : "Nenhum gasto neste mês.";

  }


  const savedThis =
    mt
      .filter(
        t =>
          t.type === "save"
      )
      .reduce(
        (a, t) =>
          a +
          Number(t.amount),
        0
      );


  if ($("summaryList")) {

    $("summaryList").innerHTML = `

      <div>
        <span>Gastos</span>
        <strong>
          ${money(expenses)}
        </strong>
      </div>

      <div>
        <span>Entradas</span>
        <strong>
          ${money(income)}
        </strong>
      </div>

      <div>
        <span>
          Guardado neste mês
        </span>

        <strong>
          ${money(savedThis)}
        </strong>
      </div>

      <div>
        <span>
          Resultado do mês
        </span>

        <strong>
          ${money(
            income -
            expenses -
            savedThis
          )}
        </strong>
      </div>

    `;

  }


  const recent =
    [...transactions]
      .sort(
        (a, b) =>
          String(b.date)
            .localeCompare(
              String(a.date)
            )
      )
      .slice(0, 6);


  if ($("recentTransactions")) {

    $("recentTransactions").innerHTML =
      recent.length

        ? recent
            .map(transactionHtml)
            .join("")

        : `
          <div class="empty-state">
            Nenhuma movimentação registrada.
          </div>
        `;

  }

}


/* =========================================================
   GRÁFICO
========================================================= */

function renderExpensesChart(
  transactionList
) {

  const canvas =
    document.getElementById(
      "expensesChart"
    );


  if (!canvas) return;


  const expenses =
    transactionList.filter(
      transaction =>
        transaction.type ===
        "expense"
    );


  const categoryTotals = {};


  expenses.forEach(
    transaction => {

      const category =
        transaction.category ||
        "Outros";


      const amount =
        Number(
          transaction.amount
        ) || 0;


      if (
        !categoryTotals[
          category
        ]
      ) {

        categoryTotals[
          category
        ] = 0;

      }


      categoryTotals[
        category
      ] += amount;

    }
  );


  const labels =
    Object.keys(
      categoryTotals
    );


  const values =
    Object.values(
      categoryTotals
    );


  if (expensesChart) {

    expensesChart.destroy();

  }


  if (
    typeof Chart ===
    "undefined"
  ) {

    return;

  }


  expensesChart =
    new Chart(
      canvas,
      {

        type: "doughnut",

        data: {

          labels,

          datasets: [

            {
              data: values
            }

          ]

        },

        options: {

          responsive: true,

          maintainAspectRatio:
            false,

          plugins: {

            legend: {

              position:
                "bottom"

            },

            tooltip: {

              callbacks: {

                label:
                  function(
                    context
                  ) {

                    const value =
                      context.raw;


                    return (
                      " R$ " +
                      value.toLocaleString(
                        "pt-BR",
                        {
                          minimumFractionDigits:
                            2
                        }
                      )
                    );

                  }

              }

            }

          }

        }

      }
    );

}


/* =========================================================
   TRANSAÇÕES
========================================================= */

function transactionHtml(t) {

  const positive =
    t.type === "income" ||
    t.type === "withdraw";


  return `

    <div class="transaction">

      <div
        class="
          transaction-icon
          ${t.type}
        "
      >
        ${
          t.type === "income"
            ? "↑"
            : t.type === "expense"
              ? "↓"
              : t.type === "save"
                ? "$"
                : "↩"
        }
      </div>


      <div class="transaction-main">

        <strong>
          ${escapeHtml(
            t.description
          )}
        </strong>

        <small>
          ${escapeHtml(
            t.category ||
            getTypeLabel(
              t.type
            )
          )}

          ·

          ${formatDate(
            t.date
          )}
        </small>

      </div>


      <strong
        class="
          ${positive
            ? "positive"
            : "negative"}
        "
      >
        ${positive ? "+" : "-"}
        ${money(t.amount)}
      </strong>


      <button
        class="more-btn"
        data-edit="${t.id}"
        title="Editar"
      >
        ✎
      </button>


      <button
        class="more-btn"
        data-delete="${t.id}"
        title="Excluir"
      >
        ×
      </button>

    </div>

  `;

}


function formatDate(d) {

  if (!d) return "";

  const [
    y,
    m,
    day
  ] =
    d.split("-");


  return `${day}/${m}/${y}`;

}


function renderTransactions() {

  const search =
    (
      $("searchTransactions")
        ?.value ||
      ""
    ).toLowerCase();


  const type =
    $("typeFilter")
      ?.value || "";


  const category =
    $("categoryFilter")
      ?.value || "";


  let arr =
    [...transactions]
      .filter(
        t =>

          (!type ||
            t.type === type)

          &&

          (!category ||
            t.category ===
            category)

          &&

          (
            !search ||

            String(
              t.description
            )
              .toLowerCase()
              .includes(search)
          )

      );


  arr.sort(
    (a, b) =>
      String(b.date)
        .localeCompare(
          String(a.date)
        )
  );


  if ($("transactionCount")) {

    $("transactionCount")
      .textContent =
      `${arr.length} registro${
        arr.length !== 1
          ? "s"
          : ""
      }`;

  }


  if ($("allTransactions")) {

    $("allTransactions")
      .innerHTML =
      arr.length

        ? arr
            .map(
              transactionHtml
            )
            .join("")

        : `
          <div class="empty-state">
            Nenhum registro encontrado.
          </div>
        `;

  }


  bindTransactionActions();

}


function bindTransactionActions() {

  document
    .querySelectorAll(
      "[data-delete]"
    )
    .forEach(button => {

      button.onclick =
        async () => {

          if (
            !confirm(
              "Excluir esta movimentação?"
            )
          ) {

            return;

          }


          await deleteDoc(
            doc(
              sub("transactions"),
              button.dataset.delete
            )
          );


          showToast(
            "Movimentação excluída."
          );

        };

    });


  document
    .querySelectorAll(
      "[data-edit]"
    )
    .forEach(button => {

      button.onclick =
        () =>
          editTransaction(
            button.dataset.edit
          );

    });

}


/* =========================================================
   CATEGORIAS
========================================================= */

function populateCategories() {

  if (!$("transactionCategory"))
    return;


  const opts =
    [...categories]
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      )
      .map(
        c =>
          `
            <option
              value="${escapeHtml(
                c.name
              )}"
            >
              ${escapeHtml(
                c.name
              )}
            </option>
          `
      )
      .join("");


  $("transactionCategory")
    .innerHTML = opts;


  if ($("categoryFilter")) {

    $("categoryFilter")
      .innerHTML =
      `
        <option value="">
          Todas as categorias
        </option>

        ${opts}
      `;

  }

}


/* =========================================================
   TIPO DE TRANSAÇÃO
========================================================= */

function setTransactionType(
  type
) {

  if ($("transactionType")) {

    $("transactionType").value =
      type;

  }


  document
    .querySelectorAll(
      ".type-btn"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.type ===
        type
      );

    });


  if ($("transactionCategoryWrap")) {

    $("transactionCategoryWrap")
      .classList.toggle(
        "hidden",
        type === "save" ||
        type === "withdraw"
      );

  }


  const payment =
    $("paymentMethod")
      ?.closest("label");


  if (payment) {

    payment.classList.toggle(
      "hidden",
      type === "save" ||
      type === "withdraw"
    );

  }

}


/* =========================================================
   ABRIR TRANSAÇÃO
========================================================= */

function openTransaction(
  type = "expense"
) {

  if (!$("transactionForm"))
    return;


  $("transactionForm")
    .reset();


  if ($("transactionId")) {

    $("transactionId")
      .value = "";

  }


  if ($("transactionDate")) {

    $("transactionDate")
      .value = today();

  }


  if ($("transactionModalTitle")) {

    $("transactionModalTitle")
      .textContent =
      "Adicionar movimentação";

  }


  setTransactionType(type);


  openModal(
    "transactionModal"
  );

}


/* =========================================================
   EDITAR TRANSAÇÃO
========================================================= */

function editTransaction(id) {

  const t =
    transactions.find(
      x => x.id === id
    );


  if (!t) return;


  if ($("transactionId")) {

    $("transactionId")
      .value = id;

  }


  if ($("transactionAmount")) {

    $("transactionAmount")
      .value = t.amount;

  }


  if ($("transactionDescription")) {

    $("transactionDescription")
      .value =
      t.description;

  }


  if ($("transactionDate")) {

    $("transactionDate")
      .value = t.date;

  }


  if ($("paymentMethod")) {

    $("paymentMethod")
      .value =
      t.paymentMethod ||
      "Pix";

  }


  if ($("transactionNote")) {

    $("transactionNote")
      .value =
      t.note || "";

  }


  setTransactionType(
    t.type
  );


  if (
    t.category &&
    $("transactionCategory")
  ) {

    $("transactionCategory")
      .value =
      t.category;

  }


  if ($("transactionModalTitle")) {

    $("transactionModalTitle")
      .textContent =
      "Editar movimentação";

  }


  openModal(
    "transactionModal"
  );

}


/* =========================================================
   SALVAR TRANSAÇÃO
========================================================= */

if ($("transactionForm")) {

  $("transactionForm").onsubmit =
    async e => {

      e.preventDefault();


      const id =
        $("transactionId")
          ?.value;


      const data = {

        type:
          $("transactionType")
            .value,

        amount:
          Number(
            $("transactionAmount")
              .value
          ),

        description:
          $("transactionDescription")
            .value
            .trim(),

        category:
          $("transactionCategory")
            ?.value || "",

        date:
          $("transactionDate")
            .value,

        paymentMethod:
          $("paymentMethod")
            ?.value || "",

        note:
          $("transactionNote")
            ?.value
            .trim() || "",

        updatedAt:
          serverTimestamp()

      };


      try {

        if (id) {

          await updateDoc(
            doc(
              sub("transactions"),
              id
            ),
            data
          );

        } else {

          await addDoc(
            sub("transactions"),
            {
              ...data,
              createdAt:
                serverTimestamp()
            }
          );

        }


        closeModal(
          $("transactionModal")
        );


        showToast(
          "Movimentação salva."
        );


      } catch (e) {

        showToast(
          firebaseError(e),
          "error"
        );

      }

    };

}


/* =========================================================
   METAS
========================================================= */

function renderGoals() {

  if (!$("goalsGrid"))
    return;


  $("goalsGrid").innerHTML =
    goals.length

      ? goals
          .map(g => {

            const pct =
              Math.min(
                100,
                (
                  Number(
                    g.current
                  ) || 0
                ) /
                (
                  Number(
                    g.target
                  ) || 1
                ) *
                100
              );


            return `

              <article
                class="goal-card"
              >

                <div
                  class="goal-top"
                >

                  <div>

                    <h3>
                      ${escapeHtml(
                        g.name
                      )}
                    </h3>

                    <small>
                      ${
                        g.deadline
                          ? `Prazo: ${
                              formatDate(
                                g.deadline
                              )
                            }`
                          : "Sem prazo"
                      }
                    </small>

                  </div>


                  <button
                    class="more-btn"
                    data-goal-delete="${g.id}"
                  >
                    ×
                  </button>

                </div>


                <div
                  class="goal-values"
                >

                  <strong>
                    ${money(
                      g.current
                    )}
                  </strong>

                  <span>
                    de
                    ${money(
                      g.target
                    )}
                  </span>

                </div>


                <div
                  class="progress"
                >

                  <i
                    style="
                      width:${pct}%
                    "
                  ></i>

                </div>


                <small>
                  ${pct.toFixed(0)}%
                  concluído
                </small>

              </article>

            `;

          })
          .join("")

      : `

          <div
            class="empty-state panel"
          >
            Você ainda não criou
            nenhuma meta.
          </div>

        `;


  document
    .querySelectorAll(
      "[data-goal-delete]"
    )
    .forEach(button => {

      button.onclick =
        async () => {

          if (
            !confirm(
              "Excluir esta meta?"
            )
          ) {

            return;

          }


          await deleteDoc(
            doc(
              sub("goals"),
              button.dataset.goalDelete
            )
          );

        };

    });

}


/* =========================================================
   NOVA META
========================================================= */

if ($("goalForm")) {

  $("goalForm").onsubmit =
    async e => {

      e.preventDefault();


      await addDoc(
        sub("goals"),
        {

          name:
            $("goalName")
              .value
              .trim(),

          target:
            Number(
              $("goalTarget")
                .value
            ),

          current:
            Number(
              $("goalCurrent")
                .value || 0
            ),

          deadline:
            $("goalDeadline")
              .value || "",

          createdAt:
            serverTimestamp()

        }
      );


      closeModal(
        $("goalModal")
      );


      e.target.reset();


      showToast(
        "Meta criada."
      );

    };

}


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

function renderSettings() {

  if (!$("fixedList"))
    return;


  $("fixedList").innerHTML =
    fixedExpenses.length

      ? fixedExpenses
          .map(
            x => `

              <div
                class="setting-row"
              >

                <span>

                  <strong>
                    ${escapeHtml(
                      x.name
                    )}
                  </strong>

                  <small>
                    Dia
                    ${x.day || "—"}
                  </small>

                </span>


                <strong>
                  ${money(x.amount)}
                </strong>


                <button
                  class="more-btn"
                  data-fixed-delete="${x.id}"
                >
                  ×
                </button>

              </div>

            `
          )
          .join("")

      : `

          <div class="empty-state">
            Nenhum gasto fixo.
          </div>

        `;


  if ($("categoryList")) {

    $("categoryList")
      .innerHTML =
      [...categories]
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name
            )
        )
        .map(
          x => `

            <div
              class="setting-row"
            >

              <span>
                ${escapeHtml(
                  x.name
                )}
              </span>

              <button
                class="more-btn"
                data-cat-delete="${x.id}"
              >
                ×
              </button>

            </div>

          `
        )
        .join("");

  }


  document
    .querySelectorAll(
      "[data-fixed-delete]"
    )
    .forEach(button => {

      button.onclick =
        async () => {

          if (
            confirm(
              "Excluir gasto fixo?"
            )
          ) {

            await deleteDoc(
              doc(
                sub("fixedExpenses"),
                button.dataset.fixedDelete
              )
            );

          }

        };

    });


  document
    .querySelectorAll(
      "[data-cat-delete]"
    )
    .forEach(button => {

      button.onclick =
        async () => {

          if (
            confirm(
              "Excluir categoria?"
            )
          ) {

            await deleteDoc(
              doc(
                sub("categories"),
                button.dataset.catDelete
              )
            );

          }

        };

    });

}


/* =========================================================
   GASTOS FIXOS / CATEGORIAS
========================================================= */

let simpleMode = "";


if ($("newFixedBtn")) {

  $("newFixedBtn").onclick =
    () => {

      simpleMode = "fixed";


      $("simpleModalTitle")
        .textContent =
        "Novo gasto fixo";


      $("simpleValueLabel")
        ?.classList
        .remove("hidden");


      $("simpleDayLabel")
        ?.classList
        .remove("hidden");


      $("simpleName")
        .value = "";


      $("simpleValue")
        .value = "";


      $("simpleDay")
        .value = "";


      openModal(
        "simpleModal"
      );

    };

}


if ($("newCategoryBtn")) {

  $("newCategoryBtn").onclick =
    () => {

      simpleMode = "category";


      $("simpleModalTitle")
        .textContent =
        "Nova categoria";


      $("simpleValueLabel")
        ?.classList
        .add("hidden");


      $("simpleDayLabel")
        ?.classList
        .add("hidden");


      $("simpleName")
        .value = "";


      openModal(
        "simpleModal"
      );

    };

}


if ($("simpleForm")) {

  $("simpleForm").onsubmit =
    async e => {

      e.preventDefault();


      if (
        simpleMode ===
        "fixed"
      ) {

        await addDoc(
          sub("fixedExpenses"),
          {

            name:
              $("simpleName")
                .value
                .trim(),

            amount:
              Number(
                $("simpleValue")
                  .value
              ),

            day:
              Number(
                $("simpleDay")
                  .value || 0
              ),

            createdAt:
              serverTimestamp()

          }
        );


      } else {

        await addDoc(
          sub("categories"),
          {

            name:
              $("simpleName")
                .value
                .trim(),

            createdAt:
              serverTimestamp()

          }
        );

      }


      closeModal(
        $("simpleModal")
      );


      showToast(
        "Salvo."
      );

    };

}


/* =========================================================
   TROCA DE ÁREA
========================================================= */

function openModule(module) {

  /*
    Fecha o menu do celular
    sempre que trocar de área.
  */

  closeMobileMenu();


  /*
    Esconde a tela de escolha.
  */

  if ($("homeView")) {

    $("homeView")
      .classList
      .add("hidden");

  }


  /*
    FINANCEIRO
  */

  if (module === "finance") {

    /*
      Mostra navegação financeira.
    */

    if ($("financeNav")) {

      $("financeNav")
        .classList
        .remove("hidden");

    }


    /*
      Esconde navegação de tarefas.
    */

    if ($("tasksNav")) {

      $("tasksNav")
        .classList
        .add("hidden");

    }


    /*
      Botão rápido volta
      a ser de movimentação.
    */

    if ($("quickAdd")) {

      $("quickAdd")
        .classList
        .remove("hidden");

      $("quickAdd").textContent =
        "+ Adicionar";

    }


    goPage("dashboard");

  }


  /*
    TAREFAS
  */

  if (module === "tasks") {

    /*
      Esconde navegação financeira.
    */

    if ($("financeNav")) {

      $("financeNav")
        .classList
        .add("hidden");

    }


    /*
      Mostra navegação de tarefas.
    */

    if ($("tasksNav")) {

      $("tasksNav")
        .classList
        .remove("hidden");

    }


    /*
      Se existir uma página
      de tarefas, abre ela.
    */

    goPage("tasks");

  }

}


/* =========================================================
   PÁGINAS
========================================================= */

function goPage(page) {

  currentPage = page;


  /*
    Fecha menu mobile.
  */

  closeMobileMenu();


  /*
    Esconde todas as páginas.
  */

  document
    .querySelectorAll(".page")
    .forEach(p => {

      p.classList.toggle(
        "hidden",
        p.id !==
        `page-${page}`
      );

    });


  /*
    Marca item ativo.
  */

  document
    .querySelectorAll(
      ".nav-item[data-page]"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page ===
        page
      );

    });


  /*
    Títulos.
  */

  const titles = {

    dashboard:
      "Dashboard",

    transactions:
      "Movimentações",

    tasks:
      "Tarefas",

    goals:
      "Metas",

    settings:
      "Configurações"

  };


  if ($("pageTitle")) {

    $("pageTitle").textContent =
      titles[page] ||
      "Meu Controle";

  }

}


/* =========================================================
   BOTÃO VOLTAR PARA ESCOLHA DE ÁREA
========================================================= */

document
  .querySelectorAll(
    "[data-home]"
  )
  .forEach(button => {

    button.onclick = () => {

      closeMobileMenu();


      if ($("homeView")) {

        $("homeView")
          .classList
          .remove("hidden");

      }


      document
        .querySelectorAll(".page")
        .forEach(page => {

          page.classList.add(
            "hidden"
          );

        });

    };

  });


/* =========================================================
   BOTÕES DE ÁREA
========================================================= */

document
  .querySelectorAll(
    "[data-module]"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        openModule(
          button.dataset.module
        );

      }
    );

  });


/* =========================================================
   BOTÕES DE PÁGINA
========================================================= */

document
  .querySelectorAll(
    "[data-page]"
  )
  .forEach(button => {

    button.onclick = () => {

      goPage(
        button.dataset.page
      );

    };

  });


document
  .querySelectorAll(
    "[data-page-link]"
  )
  .forEach(button => {

    button.onclick = () =>
      goPage(
        button.dataset.pageLink
      );

  });


/* =========================================================
   BOTÃO ADICIONAR
========================================================= */

if ($("quickAdd")) {

  $("quickAdd").onclick =
    () =>
      openTransaction();

}


/* =========================================================
   BOTÃO NOVA META
========================================================= */

if ($("newGoalBtn")) {

  $("newGoalBtn").onclick =
    () =>
      openModal(
        "goalModal"
      );

}


/* =========================================================
   FILTRO DE MÊS
========================================================= */

if ($("monthFilter")) {

  $("monthFilter")
    .value =
    selectedMonth;


  $("monthFilter").onchange =
    e => {

      selectedMonth =
        e.target.value;

      renderDashboard();

    };

}


/* =========================================================
   FILTROS DE TRANSAÇÕES
========================================================= */

if ($("searchTransactions")) {

  $("searchTransactions")
    .oninput =
    renderTransactions;

}


if ($("typeFilter")) {

  $("typeFilter")
    .onchange =
    renderTransactions;

}


if ($("categoryFilter")) {

  $("categoryFilter")
    .onchange =
    renderTransactions;

}


/* =========================================================
   BOTÕES DE TIPO
========================================================= */

document
  .querySelectorAll(
    ".type-btn"
  )
  .forEach(button => {

    button.onclick = () =>
      setTransactionType(
        button.dataset.type
      );

  });


/* =========================================================
   FECHAR MODAIS
========================================================= */

document
  .querySelectorAll(
    ".close-modal"
  )
  .forEach(button => {

    button.onclick = () =>
      closeModal(
        button.closest(
          ".modal"
        )
      );

  });


document
  .querySelectorAll(".modal")
  .forEach(modal => {

    modal.addEventListener(
      "click",
      e => {

        if (
          e.target ===
          modal
        ) {

          closeModal(
            modal
          );

        }

      }
    );

  });


/* =========================================================
   MENU MOBILE
========================================================= */

function closeMobileMenu() {

  const sidebar =
    document.querySelector(
      ".sidebar"
    );


  if (sidebar) {

    sidebar.classList.remove(
      "open"
    );

  }

}


/*
  Abre / fecha o menu
  pelas três barrinhas.
*/

if ($("mobileMenu")) {

  $("mobileMenu").onclick =
    e => {

      e.stopPropagation();


      const sidebar =
        document.querySelector(
          ".sidebar"
        );


      if (!sidebar) return;


      sidebar.classList.toggle(
        "open"
      );

    };

}


/*
  Se clicar em qualquer
  item do menu, fecha.
*/

document
  .querySelectorAll(
    ".sidebar [data-page], .sidebar [data-home], .sidebar [data-module]"
  )
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        closeMobileMenu();

      }
    );

  });


/*
  Se clicar fora da sidebar
  no celular, fecha.
*/

document.addEventListener(
  "click",
  e => {

    const sidebar =
      document.querySelector(
        ".sidebar"
      );


    const mobileMenu =
      $("mobileMenu");


    if (!sidebar) return;


    const isMobile =
      window.innerWidth <= 900;


    if (!isMobile) return;


    if (
      sidebar.classList.contains(
        "open"
      ) &&

      !sidebar.contains(
        e.target
      ) &&

      !mobileMenu?.contains(
        e.target
      )
    ) {

      closeMobileMenu();

    }

  }
);


/*
  ESC também fecha.
*/

document.addEventListener(
  "keydown",
  e => {

    if (
      e.key === "Escape"
    ) {

      closeMobileMenu();

      closeAllModals();

    }

  }
);


/*
  Se mudar para tela grande,
  garante que o estado mobile
  não fique preso.
*/

window.addEventListener(
  "resize",
  () => {

    if (
      window.innerWidth >
      900
    ) {

      closeMobileMenu();

    }

  }
);


/* =========================================================
   ALTERAR SENHA
========================================================= */

if ($("changePasswordBtn")) {

  $("changePasswordBtn").onclick =
    async () => {

      try {

        await resetPassword(
          auth,
          user.email
        );


        showToast(
          "E-mail para troca de senha enviado."
        );

      } catch (e) {

        showToast(
          firebaseError(e),
          "error"
        );

      }

    };

}


/* =========================================================
   EXPORTAR DADOS
========================================================= */

if ($("exportBtn")) {

  $("exportBtn").onclick =
    () => {

      const data = {

        exportedAt:
          new Date()
            .toISOString(),

        transactions,

        categories,

        goals,

        fixedExpenses

      };


      const blob =
        new Blob(
          [
            JSON.stringify(
              data,
              null,
              2
            )
          ],
          {
            type:
              "application/json"
          }
        );


      const a =
        document.createElement(
          "a"
        );


      a.href =
        URL.createObjectURL(
          blob
        );


      a.download =
        `controle-financeiro-${today()}.json`;


      a.click();


      URL.revokeObjectURL(
        a.href
      );

    };

}


/* =========================================================
   APAGAR DADOS
========================================================= */

if ($("deleteDataBtn")) {

  $("deleteDataBtn").onclick =
    async () => {

      if (
        !confirm(
          "Isso apagará suas movimentações, metas, categorias e gastos fixos. Continuar?"
        )
      ) {

        return;

      }


      const all = [

        ...transactions.map(
          x => [
            "transactions",
            x.id
          ]
        ),

        ...goals.map(
          x => [
            "goals",
            x.id
          ]
        ),

        ...fixedExpenses.map(
          x => [
            "fixedExpenses",
            x.id
          ]
        ),

        ...categories.map(
          x => [
            "categories",
            x.id
          ]
        )

      ];


      const batch =
        writeBatch(db);


      all.forEach(
        ([collectionName, id]) => {

          batch.delete(
            doc(
              db,
              "users",
              user.uid,
              collectionName,
              id
            )
          );

        }
      );


      await batch.commit();


      await seedCategories();


      showToast(
        "Dados apagados."
      );

    };

}
