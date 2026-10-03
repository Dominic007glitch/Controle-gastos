import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail
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

let expensesChart = null;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* =========================================================
   UTILITÁRIOS
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


function openModal(id) {
  const modal = $(id);

  if (modal) {
    modal.classList.remove("hidden");
  }
}


function closeModal(modal) {
  if (modal) {
    modal.classList.add("hidden");
  }
}


function closeAllModals() {
  document
    .querySelectorAll(".modal")
    .forEach(modal => modal.classList.add("hidden"));
}


/* =========================================================
   VARIÁVEIS
========================================================= */

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

let selectedMonth =
  new Date().toISOString().slice(0, 7);


/* =========================================================
   FIRESTORE REFERÊNCIAS
========================================================= */

function userRef() {
  return doc(db, "users", user.uid);
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
   AUTENTICAÇÃO
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

    await setDoc(ref, {
      name: user.displayName || "Usuário",
      email: user.email,
      createdAt: serverTimestamp()
    });

  }
}


/* =========================================================
   LOGIN / LOGOUT
========================================================= */

onAuthStateChanged(auth, async u => {

  setLoading(true);

  try {

    if (u) {

      user = u;

      await ensureProfile();

      if ($("authView")) {
        $("authView").classList.add("hidden");
      }

      if ($("appView")) {
        $("appView").classList.remove("hidden");
      }

      if ($("userMini")) {

        $("userMini").innerHTML = `
          <strong>
            ${escapeHtml(u.displayName || "Usuário")}
          </strong>

          <small>
            ${escapeHtml(u.email || "")}
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

      if (
        $("monthFilter") &&
        !$("monthFilter").value
      ) {
        $("monthFilter").value =
          selectedMonth;
      }


      /*
        Tela inicial de escolha
      */

      if ($("homeView")) {

        $("homeView").classList.remove(
          "hidden"
        );

      }


      /*
        Nenhuma página financeira aberta
      */

      document
        .querySelectorAll(".page")
        .forEach(page => {
          page.classList.add("hidden");
        });


      /*
        Começa a escutar os dados
      */

      listenData();

    } else {

      user = null;

      transactions = [];
      goals = [];
      categories = [];
      fixedExpenses = [];


      if ($("appView")) {
        $("appView").classList.add("hidden");
      }

      if ($("authView")) {
        $("authView").classList.remove("hidden");
      }

      if ($("homeView")) {
        $("homeView").classList.add("hidden");
      }

    }

  } catch (error) {

    console.error(
      "Erro ao iniciar o sistema:",
      error
    );

  } finally {

    /*
      MUITO IMPORTANTE:
      sempre tira a tela de carregamento.
    */

    setLoading(false);

  }

});


/* =========================================================
   FORMULÁRIO DE LOGIN
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
   CADASTRO
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
        $("loginEmail").value.trim();

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
   ABAS DE LOGIN / CADASTRO
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
   FIRESTORE — ESCUTAR DADOS
========================================================= */

function listenData() {

  unsubscribers.forEach(fn => {

    try {
      fn();
    } catch (e) {
      console.error(e);
    }

  });

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


        /*
          Se houver problema com orderBy,
          tenta carregar sem ordenação.
        */

        const fallback =
          onSnapshot(
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

            },

            fallbackError => {

              console.error(
                `Erro no fallback de ${name}:`,
                fallbackError
              );

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


  const catUnsub =
    onSnapshot(
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

      },

      error => {
        console.error(
          "Erro ao carregar categorias:",
          error
        );
      }
    );


  unsubscribers.push(catUnsub);

}


/* =========================================================
   CATEGORIAS PADRÃO
========================================================= */

async function seedCategories() {

  if (!user) return;

  try {

    const batch =
      writeBatch(db);

    defaultCategories.forEach(
      name => {

        batch.set(
          doc(
            sub("categories")
          ),
          {
            name,
            createdAt:
              serverTimestamp()
          }
        );

      }
    );

    await batch.commit();

  } catch (error) {

    console.error(
      "Erro ao criar categorias:",
      error
    );

  }

}


/* =========================================================
   FINANCEIRO
========================================================= */

function getTypeLabel(t) {

  return {
    income: "Entrada",
    expense: "Gasto",
    save: "Guardou",
    withdraw: "Retirou da reserva"
  }[t] || t;

}


function signedAmount(t, v) {

  return (
    t === "income" ||
    t === "withdraw"
  )
    ? Number(v)
    : -Number(v);

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
    (a, t) =>
      a +
      (
        t.type === "save"
          ? Number(t.amount)
          : t.type === "withdraw"
            ? -Number(t.amount)
            : 0
      ),
    0
  );

}


function totalBalance() {

  return transactions.reduce(
    (a, t) =>
      a +
      signedAmount(
        t.type,
        t.amount
      ),
    0
  );

}


/* =========================================================
   RENDER GERAL
========================================================= */

function renderAll() {

  /*
    Só renderiza se os elementos
    realmente existirem no HTML.
  */

  renderDashboard();
  renderTransactions();
  renderGoals();
  renderSettings();
  populateCategories();

}


/* =========================================================
   GRÁFICO DE GASTOS
========================================================= */

function renderExpensesChart(
  transactionList
) {

  const canvas =
    $("expensesChart");

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
        !categoryTotals[category]
      ) {
        categoryTotals[category] = 0;
      }

      categoryTotals[category] +=
        amount;

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

    expensesChart = null;

  }


  /*
    Chart.js pode não estar carregado.
    Não deixa isso quebrar o site.
  */

  if (
    typeof Chart ===
    "undefined"
  ) {

    console.warn(
      "Chart.js não foi carregado."
    );

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
          maintainAspectRatio: false,

          plugins: {

            legend: {
              position: "bottom"
            },

            tooltip: {

              callbacks: {

                label:
                  function(context) {

                    const value =
                      context.raw;

                    return (
                      " R$ " +
                      Number(value)
                        .toLocaleString(
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
   DASHBOARD
========================================================= */

function renderDashboard() {

  if (!$("balance")) return;


  const mt =
    monthTransactions();


  const income =
    mt
      .filter(
        t => t.type === "income"
      )
      .reduce(
        (a, t) =>
          a + Number(t.amount),
        0
      );


  const expenses =
    mt
      .filter(
        t => t.type === "expense"
      )
      .reduce(
        (a, t) =>
          a + Number(t.amount),
        0
      );


  $("balance").textContent =
    money(totalBalance());

  $("saved").textContent =
    money(totalSaved());

  $("income").textContent =
    money(income);

  $("expenses").textContent =
    money(expenses);


  renderExpensesChart(
    transactions
  );


  const by = {};


  mt
    .filter(
      t => t.type === "expense"
    )
    .forEach(
      t => {

        const category =
          t.category ||
          "Outros";

        by[category] =
          (
            by[category] || 0
          ) +
          Number(t.amount);

      }
    );


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
              ([name, val]) => {

                const max =
                  entries[0][1] || 1;

                return `
                  <div class="bar-row">

                    <div>
                      <span>
                        ${escapeHtml(name)}
                      </span>

                      <strong>
                        ${money(val)}
                      </strong>
                    </div>

                    <div class="bar">
                      <i
                        style="width:${Math.max(
                          3,
                          val / max * 100
                        )}%"
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
        t => t.type === "save"
      )
      .reduce(
        (a, t) =>
          a + Number(t.amount),
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
        <span>Guardado neste mês</span>
        <strong>
          ${money(savedThis)}
        </strong>
      </div>

      <div>
        <span>Resultado do mês</span>
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
   TRANSAÇÕES
========================================================= */

function transactionHtml(t) {

  const positive =
    t.type === "income" ||
    t.type === "withdraw";


  return `

    <div class="transaction">

      <div class="transaction-icon ${t.type}">
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
            getTypeLabel(t.type)
          )}
          ·
          ${formatDate(t.date)}
        </small>

      </div>

      <strong
        class="${
          positive
            ? "positive"
            : "negative"
        }"
      >
        ${
          positive
            ? "+"
            : "-"
        }${money(t.amount)}
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
  ] = d.split("-");

  return `${day}/${m}/${y}`;

}


function renderTransactions() {

  if (
    !$("searchTransactions") ||
    !$("typeFilter") ||
    !$("categoryFilter") ||
    !$("allTransactions")
  ) {
    return;
  }


  const search =
    (
      $("searchTransactions")
        .value || ""
    ).toLowerCase();


  const type =
    $("typeFilter").value;

  const cat =
    $("categoryFilter").value;


  let arr =
    [...transactions]
      .filter(
        t =>
          (!type ||
            t.type === type) &&

          (!cat ||
            t.category === cat) &&

          (!search ||
            String(
              t.description
            )
              .toLowerCase()
              .includes(search))
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


  $("allTransactions")
    .innerHTML =

    arr.length

      ? arr
          .map(transactionHtml)
          .join("")

      : `
        <div class="empty-state">
          Nenhum registro encontrado.
        </div>
      `;


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

          try {

            await deleteDoc(
              doc(
                sub("transactions"),
                button.dataset.delete
              )
            );

            showToast(
              "Movimentação excluída."
            );

          } catch (error) {

            showToast(
              firebaseError(error),
              "error"
            );

          }

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

  if (
    !$("transactionCategory") ||
    !$("categoryFilter")
  ) {
    return;
  }


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
          `<option value="${escapeHtml(
            c.name
          )}">
            ${escapeHtml(c.name)}
          </option>`
      )
      .join("");


  $("transactionCategory")
    .innerHTML = opts;


  $("categoryFilter")
    .innerHTML =
    `<option value="">
      Todas as categorias
    </option>${opts}`;

}


/* =========================================================
   TIPO DE TRANSAÇÃO
========================================================= */

function setTransactionType(type) {

  if ($("transactionType")) {

    $("transactionType").value =
      type;

  }


  document
    .querySelectorAll(".type-btn")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.type === type
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


  if ($("paymentMethod")) {

    const label =
      $("paymentMethod")
        .closest("label");

    if (label) {

      label.classList.toggle(
        "hidden",
        type === "save" ||
        type === "withdraw"
      );

    }

  }

}


/* =========================================================
   ABRIR / EDITAR TRANSAÇÃO
========================================================= */

function openTransaction(
  type = "expense"
) {

  if (!$("transactionForm")) {
    return;
  }

  $("transactionForm").reset();

  $("transactionId").value = "";

  $("transactionDate").value =
    today();

  $("transactionModalTitle")
    .textContent =
    "Adicionar movimentação";

  setTransactionType(type);

  openModal(
    "transactionModal"
  );

}


function editTransaction(id) {

  const t =
    transactions.find(
      x => x.id === id
    );

  if (!t) return;


  $("transactionId").value =
    id;

  $("transactionAmount").value =
    t.amount;

  $("transactionDescription").value =
    t.description;

  $("transactionDate").value =
    t.date;

  $("paymentMethod").value =
    t.paymentMethod || "Pix";

  $("transactionNote").value =
    t.note || "";


  setTransactionType(
    t.type
  );


  if (t.category) {

    $("transactionCategory")
      .value =
      t.category;

  }


  $("transactionModalTitle")
    .textContent =
    "Editar movimentação";


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
        $("transactionId").value;


      const data = {

        type:
          $("transactionType").value,

        amount:
          Number(
            $("transactionAmount").value
          ),

        description:
          $("transactionDescription")
            .value
            .trim(),

        category:
          $("transactionCategory")
            .value || "",

        date:
          $("transactionDate").value,

        paymentMethod:
          $("paymentMethod").value,

        note:
          $("transactionNote")
            .value
            .trim(),

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

      } catch (error) {

        showToast(
          firebaseError(error),
          "error"
        );

      }

    };

}


/* =========================================================
   METAS
========================================================= */

function renderGoals() {

  if (!$("goalsGrid")) {
    return;
  }


  $("goalsGrid").innerHTML =

    goals.length

      ? goals
          .map(g => {

            const pct =
              Math.min(
                100,
                (
                  Number(g.current) ||
                  0
                ) /
                (
                  Number(g.target) ||
                  1
                ) *
                100
              );


            return `

              <article class="goal-card">

                <div class="goal-top">

                  <div>

                    <h3>
                      ${escapeHtml(
                        g.name
                      )}
                    </h3>

                    <small>
                      ${
                        g.deadline
                          ? `Prazo: ${formatDate(
                              g.deadline
                            )}`
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


                <div class="goal-values">

                  <strong>
                    ${money(g.current)}
                  </strong>

                  <span>
                    de ${money(g.target)}
                  </span>

                </div>


                <div class="progress">

                  <i
                    style="width:${pct}%"
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
        <div class="empty-state panel">
          Você ainda não criou nenhuma meta.
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
   FORMULÁRIO DE METAS
========================================================= */

if ($("goalForm")) {

  $("goalForm").onsubmit =
    async e => {

      e.preventDefault();

      try {

        await addDoc(
          sub("goals"),
          {
            name:
              $("goalName")
                .value
                .trim(),

            target:
              Number(
                $("goalTarget").value
              ),

            current:
              Number(
                $("goalCurrent").value ||
                0
              ),

            deadline:
              $("goalDeadline").value ||
              "",

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

      } catch (error) {

        showToast(
          firebaseError(error),
          "error"
        );

      }

    };

}


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

function renderSettings() {

  if (
    !$("fixedList") ||
    !$("categoryList")
  ) {
    return;
  }


  $("fixedList").innerHTML =

    fixedExpenses.length

      ? fixedExpenses
          .map(
            x => `

              <div class="setting-row">

                <span>

                  <strong>
                    ${escapeHtml(x.name)}
                  </strong>

                  <small>
                    Dia ${x.day || "—"}
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


  $("categoryList").innerHTML =

    [...categories]
      .sort(
        (a, b) =>
          a.name.localeCompare(
            b.name
          )
      )
      .map(
        x => `

          <div class="setting-row">

            <span>
              ${escapeHtml(x.name)}
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
        .classList
        .remove("hidden");

      $("simpleDayLabel")
        .classList
        .remove("hidden");

      $("simpleName").value = "";
      $("simpleValue").value = "";
      $("simpleDay").value = "";

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
        .classList
        .add("hidden");

      $("simpleDayLabel")
        .classList
        .add("hidden");

      $("simpleName").value = "";

      openModal(
        "simpleModal"
      );

    };

}


if ($("simpleForm")) {

  $("simpleForm").onsubmit =
    async e => {

      e.preventDefault();


      try {

        if (
          simpleMode === "fixed"
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

      } catch (error) {

        showToast(
          firebaseError(error),
          "error"
        );

      }

    };

}


/* =========================================================
   NAVEGAÇÃO ENTRE FINANCEIRO E TAREFAS
========================================================= */

function openModule(module) {

  if ($("homeView")) {

    $("homeView")
      .classList
      .add("hidden");

  }


  if (module === "finance") {

    goPage(
      "dashboard"
    );

  }


  if (module === "tasks") {

    goPage(
      "tasks"
    );

  }

}


/* =========================================================
   NAVEGAÇÃO DAS PÁGINAS
========================================================= */

function goPage(page) {

  currentPage = page;


  document
    .querySelectorAll(".page")
    .forEach(p => {

      p.classList.toggle(
        "hidden",
        p.id !== `page-${page}`
      );

    });


  document
    .querySelectorAll(
      ".nav-item[data-page]"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    });


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

    $("pageTitle")
      .textContent =
      titles[page] ||
      "Meu Controle";

  }

}


/* =========================================================
   BOTÕES DA TELA INICIAL
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
   SIDEBAR
========================================================= */

document
  .querySelectorAll(
    "[data-page]"
  )
  .forEach(button => {

    button.onclick =
      () =>
        goPage(
          button.dataset.page
        );

  });


/* =========================================================
   BOTÃO INÍCIO
========================================================= */

document
  .querySelectorAll(
    "[data-home]"
  )
  .forEach(button => {

    button.onclick =
      () => {

        document
          .querySelectorAll(".page")
          .forEach(page => {
            page.classList.add(
              "hidden"
            );
          });


        if ($("homeView")) {

          $("homeView")
            .classList
            .remove("hidden");

        }

      };

  });


/* =========================================================
   LINKS INTERNOS
========================================================= */

document
  .querySelectorAll(
    "[data-page-link]"
  )
  .forEach(button => {

    button.onclick =
      () =>
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

  $("monthFilter").value =
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

    button.onclick =
      () =>
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

    button.onclick =
      () =>
        closeModal(
          button.closest(".modal")
        );

  });


document
  .querySelectorAll(".modal")
  .forEach(modal => {

    modal.addEventListener(
      "click",
      e => {

        if (
          e.target === modal
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

if ($("mobileMenu")) {

  $("mobileMenu").onclick =
    () => {

      const sidebar =
        document.querySelector(
          ".sidebar"
        );

      if (sidebar) {

        sidebar.classList.toggle(
          "open"
        );

      }

    };

}


/* =========================================================
   ALTERAR SENHA
========================================================= */

if ($("changePasswordBtn")) {

  $("changePasswordBtn").onclick =
    async () => {

      try {

        await sendPasswordResetEmail(
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
          new Date().toISOString(),

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


      try {

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

      } catch (error) {

        console.error(
          error
        );

        showToast(
          firebaseError(error),
          "error"
        );

      }

    };

}
