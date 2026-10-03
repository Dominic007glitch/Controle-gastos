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


/* =========================
   FIREBASE
   ========================= */

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


/* =========================
   ESTADO
   ========================= */

let expensesChart = null;

let user = null;
let transactions = [];
let categories = [];
let goals = [];
let fixedExpenses = [];

let unsubscribers = [];

let currentPage = "dashboard";

let selectedMonth = new Date().toISOString().slice(0, 7);


/* =========================
   UTILITÁRIOS
   ========================= */

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


/* =========================
   TOAST / LOADING
   ========================= */

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
  const el = $("loading");

  if (el) {
    el.classList.toggle("hidden", !show);
  }
}


/* =========================
   FIRESTORE REFERENCES
   ========================= */

function userRef() {
  return doc(db, "users", user.uid);
}


function sub(name) {
  return collection(db, "users", user.uid, name);
}


/* =========================
   MODAIS
   ========================= */

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


/* =========================
   AUTENTICAÇÃO
   ========================= */

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

  return map[e.code] ||
    e.message ||
    "Ocorreu um erro.";
}


/* =========================
   PERFIL
   ========================= */

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


/* =========================
   CATEGORIAS PADRÃO
   ========================= */

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


async function seedCategories() {
  const batch = writeBatch(db);

  defaultCategories.forEach(name => {
    batch.set(
      doc(sub("categories")),
      {
        name,
        createdAt: serverTimestamp()
      }
    );
  });

  await batch.commit();
}


/* =========================
   ESCAPE HTML
   ========================= */

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]
  );
}


/* =========================
   TIPOS
   ========================= */

function getTypeLabel(type) {
  return {
    income: "Entrada",
    expense: "Gasto",
    save: "Guardou",
    withdraw: "Retirou da reserva"
  }[type] || type;
}


function signedAmount(type, value) {
  return type === "income" || type === "withdraw"
    ? Number(value)
    : -Number(value);
}


/* =========================
   CÁLCULOS
   ========================= */

function monthTransactions() {
  return transactions.filter(
    transaction =>
      monthOf(transaction.date) === selectedMonth
  );
}


function totalSaved() {
  return transactions.reduce(
    (total, transaction) => {
      if (transaction.type === "save") {
        return total + Number(transaction.amount);
      }

      if (transaction.type === "withdraw") {
        return total - Number(transaction.amount);
      }

      return total;
    },
    0
  );
}


function totalBalance() {
  return transactions.reduce(
    (total, transaction) =>
      total + signedAmount(
        transaction.type,
        transaction.amount
      ),
    0
  );
}


/* =========================
   RENDER GERAL
   ========================= */

function renderAll() {
  renderDashboard();
  renderTransactions();
  renderGoals();
  renderSettings();
  populateCategories();
}


/* =========================
   GRÁFICO DE GASTOS
   ========================= */

function renderExpensesChart(data) {
  const canvas = $("expensesChart");

  if (!canvas) return;

  if (typeof Chart === "undefined") {
    console.error(
      "Chart.js não foi carregado."
    );
    return;
  }

  const expenses = data.filter(
    transaction =>
      transaction.type === "expense"
  );

  const categoryTotals = {};

  expenses.forEach(transaction => {
    const category =
      transaction.category || "Outros";

    const amount =
      Number(transaction.amount) || 0;

    if (!categoryTotals[category]) {
      categoryTotals[category] = 0;
    }

    categoryTotals[category] += amount;
  });

  const labels = Object.keys(categoryTotals);
  const values = Object.values(categoryTotals);

  if (expensesChart) {
    expensesChart.destroy();
    expensesChart = null;
  }

  expensesChart = new Chart(canvas, {
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
            label(context) {
              const value = context.raw;

              return (
                " R$ " +
                Number(value).toLocaleString(
                  "pt-BR",
                  {
                    minimumFractionDigits: 2
                  }
                )
              );
            }
          }
        }
      }
    }
  });
}


/* =========================
   DASHBOARD
   ========================= */

function renderDashboard() {
  const mt = monthTransactions();

  const income = mt
    .filter(t => t.type === "income")
    .reduce(
      (total, t) =>
        total + Number(t.amount),
      0
    );

  const expenses = mt
    .filter(t => t.type === "expense")
    .reduce(
      (total, t) =>
        total + Number(t.amount),
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


  renderExpensesChart(transactions);


  /* GASTOS POR CATEGORIA */

  const by = {};

  mt
    .filter(t => t.type === "expense")
    .forEach(t => {
      const category =
        t.category || "Outros";

      by[category] =
        (by[category] || 0) +
        Number(t.amount);
    });


  const entries =
    Object.entries(by)
      .sort((a, b) => b[1] - a[1]);


  if ($("categoryChart")) {
    $("categoryChart").className =
      entries.length
        ? "bar-chart"
        : "bar-chart empty-state";

    $("categoryChart").innerHTML =
      entries.length
        ? entries.map(
            ([name, value]) => {
              const max =
                entries[0][1] || 1;

              const width =
                Math.max(
                  3,
                  (value / max) * 100
                );

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
                    <i style="width:${width}%"></i>
                  </div>
                </div>
              `;
            }
          ).join("")
        : "Nenhum gasto neste mês.";
  }


  /* RESUMO */

  const savedThis =
    mt
      .filter(t => t.type === "save")
      .reduce(
        (total, t) =>
          total + Number(t.amount),
        0
      );


  if ($("summaryList")) {
    $("summaryList").innerHTML = `
      <div>
        <span>Gastos</span>
        <strong>${money(expenses)}</strong>
      </div>

      <div>
        <span>Entradas</span>
        <strong>${money(income)}</strong>
      </div>

      <div>
        <span>Guardado neste mês</span>
        <strong>${money(savedThis)}</strong>
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


  /* MOVIMENTAÇÕES RECENTES */

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
        ? recent.map(transactionHtml).join("")
        : `
          <div class="empty-state">
            Nenhuma movimentação registrada.
          </div>
        `;
  }
}


/* =========================
   DATA
   ========================= */

function formatDate(date) {
  if (!date) return "";

  const [year, month, day] =
    date.split("-");

  return `${day}/${month}/${year}`;
}


/* =========================
   TRANSAÇÃO HTML
   ========================= */

function transactionHtml(t) {
  const positive =
    t.type === "income" ||
    t.type === "withdraw";

  const icon =
    t.type === "income"
      ? "↑"
      : t.type === "expense"
      ? "↓"
      : t.type === "save"
      ? "$"
      : "↩";

  return `
    <div class="transaction">

      <div class="transaction-icon ${t.type}">
        ${icon}
      </div>

      <div class="transaction-main">
        <strong>
          ${escapeHtml(t.description)}
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

      <strong class="${positive ? "positive" : "negative"}">
        ${positive ? "+" : "-"}${money(t.amount)}
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


/* =========================
   TRANSAÇÕES
   ========================= */

function renderTransactions() {
  if (!$("searchTransactions")) return;

  const search =
    (
      $("searchTransactions").value ||
      ""
    ).toLowerCase();

  const type =
    $("typeFilter")?.value || "";

  const category =
    $("categoryFilter")?.value || "";


  let arr =
    [...transactions].filter(
      t =>
        (!type || t.type === type) &&
        (!category ||
          t.category === category) &&
        (
          !search ||
          String(
            t.description || ""
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
    $("transactionCount").textContent =
      `${arr.length} registro${
        arr.length !== 1
          ? "s"
          : ""
      }`;
  }


  if ($("allTransactions")) {
    $("allTransactions").innerHTML =
      arr.length
        ? arr.map(transactionHtml).join("")
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
    .querySelectorAll("[data-delete]")
    .forEach(button => {

      button.onclick = async () => {

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

          console.error(error);

          showToast(
            firebaseError(error),
            "error"
          );
        }
      };
    });


  document
    .querySelectorAll("[data-edit]")
    .forEach(button => {

      button.onclick = () =>
        editTransaction(
          button.dataset.edit
        );
    });
}


/* =========================
   CATEGORIAS
   ========================= */

function populateCategories() {
  if (!$("transactionCategory")) {
    return;
  }

  const sorted =
    [...categories].sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );


  const opts =
    sorted
      .map(
        category => `
          <option value="${escapeHtml(
            category.name
          )}">
            ${escapeHtml(
              category.name
            )}
          </option>
        `
      )
      .join("");


  $("transactionCategory").innerHTML =
    opts;


  if ($("categoryFilter")) {
    $("categoryFilter").innerHTML =
      `
        <option value="">
          Todas as categorias
        </option>
        ${opts}
      `;
  }
}


/* =========================
   TIPO DA TRANSAÇÃO
   ========================= */

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


  const hidden =
    type === "save" ||
    type === "withdraw";


  if ($("transactionCategoryWrap")) {
    $("transactionCategoryWrap")
      .classList.toggle(
        "hidden",
        hidden
      );
  }


  const payment =
    $("paymentMethod");

  if (
    payment &&
    payment.closest("label")
  ) {
    payment
      .closest("label")
      .classList.toggle(
        "hidden",
        hidden
      );
  }
}


/* =========================
   ABRIR TRANSAÇÃO
   ========================= */

function openTransaction(
  type = "expense"
) {

  $("transactionForm").reset();

  $("transactionId").value = "";

  $("transactionDate").value =
    today();

  $("transactionModalTitle")
    .textContent =
    "Adicionar movimentação";

  setTransactionType(type);

  openModal("transactionModal");
}


/* =========================
   EDITAR TRANSAÇÃO
   ========================= */

function editTransaction(id) {

  const transaction =
    transactions.find(
      item => item.id === id
    );

  if (!transaction) return;


  $("transactionId").value =
    id;

  $("transactionAmount").value =
    transaction.amount;

  $("transactionDescription").value =
    transaction.description;

  $("transactionDate").value =
    transaction.date;

  $("paymentMethod").value =
    transaction.paymentMethod ||
    "Pix";

  $("transactionNote").value =
    transaction.note || "";


  setTransactionType(
    transaction.type
  );


  if (transaction.category) {
    $("transactionCategory").value =
      transaction.category;
  }


  $("transactionModalTitle")
    .textContent =
    "Editar movimentação";


  openModal("transactionModal");
}


/* =========================
   SALVAR TRANSAÇÃO
   ========================= */

if ($("transactionForm")) {

  $("transactionForm").onsubmit =
    async event => {

      event.preventDefault();

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
          $("transactionCategory").value ||
          "",

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

        console.error(error);

        showToast(
          firebaseError(error),
          "error"
        );
      }
    };
}


/* =========================
   METAS
   ========================= */

function renderGoals() {

  if (!$("goalsGrid")) return;


  $("goalsGrid").innerHTML =
    goals.length
      ? goals
          .map(goal => {

            const pct =
              Math.min(
                100,
                (
                  (Number(goal.current) || 0) /
                  (Number(goal.target) || 1)
                ) * 100
              );


            return `
              <article class="goal-card">

                <div class="goal-top">

                  <div>

                    <h3>
                      ${escapeHtml(
                        goal.name
                      )}
                    </h3>

                    <small>
                      ${
                        goal.deadline
                          ? `Prazo: ${formatDate(
                              goal.deadline
                            )}`
                          : "Sem prazo"
                      }
                    </small>

                  </div>

                  <button
                    class="more-btn"
                    data-goal-delete="${goal.id}"
                  >
                    ×
                  </button>

                </div>


                <div class="goal-values">

                  <strong>
                    ${money(
                      goal.current
                    )}
                  </strong>

                  <span>
                    de
                    ${money(
                      goal.target
                    )}
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

          try {

            await deleteDoc(
              doc(
                sub("goals"),
                button.dataset.goalDelete
              )
            );

          } catch (error) {

            console.error(error);

            showToast(
              firebaseError(error),
              "error"
            );
          }
        };
    });
}


/* =========================
   CRIAR META
   ========================= */

if ($("goalForm")) {

  $("goalForm").onsubmit =
    async event => {

      event.preventDefault();

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

        event.target.reset();

        showToast(
          "Meta criada."
        );

      } catch (error) {

        console.error(error);

        showToast(
          firebaseError(error),
          "error"
        );
      }
    };
}


/* =========================
   CONFIGURAÇÕES
   ========================= */

function renderSettings() {

  if (!$("fixedList")) {
    return;
  }


  $("fixedList").innerHTML =
    fixedExpenses.length
      ? fixedExpenses
          .map(item => `
            <div class="setting-row">

              <span>

                <strong>
                  ${escapeHtml(
                    item.name
                  )}
                </strong>

                <small>
                  Dia ${item.day || "—"}
                </small>

              </span>

              <strong>
                ${money(item.amount)}
              </strong>

              <button
                class="more-btn"
                data-fixed-delete="${item.id}"
              >
                ×
              </button>

            </div>
          `)
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
        item => `
          <div class="setting-row">

            <span>
              ${escapeHtml(
                item.name
              )}
            </span>

            <button
              class="more-btn"
              data-cat-delete="${item.id}"
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
            !confirm(
              "Excluir gasto fixo?"
            )
          ) {
            return;
          }

          try {

            await deleteDoc(
              doc(
                sub("fixedExpenses"),
                button.dataset.fixedDelete
              )
            );

          } catch (error) {

            console.error(error);

            showToast(
              firebaseError(error),
              "error"
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
            !confirm(
              "Excluir categoria?"
            )
          ) {
            return;
          }

          try {

            await deleteDoc(
              doc(
                sub("categories"),
                button.dataset.catDelete
              )
            );

          } catch (error) {

            console.error(error);

            showToast(
              firebaseError(error),
              "error"
            );
          }
        };
    });
}


/* =========================
   LISTENERS FIRESTORE
   ========================= */

function listenData() {

  unsubscribers.forEach(
    unsubscribe => unsubscribe()
  );

  unsubscribers = [];


  const listen = (
    name,
    setter,
    sortField = "createdAt"
  ) => {

    const q = query(
      sub(name),
      orderBy(
        sortField,
        "desc"
      )
    );


    const unsubscribe =
      onSnapshot(
        q,

        snapshot => {

          setter(
            snapshot.docs.map(
              document => ({
                id: document.id,
                ...document.data()
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


          /* Fallback sem orderBy */

          const fallback =
            onSnapshot(
              sub(name),

              snapshot => {

                setter(
                  snapshot.docs.map(
                    document => ({
                      id: document.id,
                      ...document.data()
                    })
                  )
                );

                renderAll();
              },

              fallbackError => {
                console.error(
                  `Fallback ${name}:`,
                  fallbackError
                );
              }
            );


          unsubscribers.push(
            fallback
          );
        }
      );


    unsubscribers.push(
      unsubscribe
    );
  };


  listen(
    "transactions",
    value => {
      transactions = value;
    }
  );


  listen(
    "goals",
    value => {
      goals = value;
    }
  );


  listen(
    "fixedExpenses",
    value => {
      fixedExpenses = value;
    }
  );


  const categoryUnsubscribe =
    onSnapshot(
      sub("categories"),

      snapshot => {

        categories =
          snapshot.docs.map(
            document => ({
              id: document.id,
              ...document.data()
            })
          );


        if (
          !categories.length
        ) {
          seedCategories()
            .catch(error =>
              console.error(
                "Erro ao criar categorias:",
                error
              )
            );
        }


        renderAll();
      },

      error => {
        console.error(
          "Erro nas categorias:",
          error
        );
      }
    );


  unsubscribers.push(
    categoryUnsubscribe
  );
}


/* =========================
   LOGIN
   ========================= */

if ($("loginForm")) {

  $("loginForm").addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      $("authMessage").textContent =
        "Entrando...";


      try {

        await signInWithEmailAndPassword(
          auth,
          $("loginEmail").value,
          $("loginPassword").value
        );

      } catch (error) {

        console.error(error);

        $("authMessage").textContent =
          firebaseError(error);
      }
    }
  );
}


/* =========================
   CADASTRO
   ========================= */

if ($("registerForm")) {

  $("registerForm").addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      $("authMessage").textContent =
        "Criando conta...";


      try {

        const credential =
          await createUserWithEmailAndPassword(
            auth,
            $("registerEmail").value,
            $("registerPassword").value
          );


        await setDoc(
          doc(
            db,
            "users",
            credential.user.uid
          ),
          {
            name:
              $("registerName")
                .value
                .trim(),

            email:
              credential.user.email,

            createdAt:
              serverTimestamp()
          }
        );

      } catch (error) {

        console.error(error);

        $("authMessage").textContent =
          firebaseError(error);
      }
    }
  );
}


/* =========================
   RECUPERAR SENHA
   ========================= */

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

      } catch (error) {

        $("authMessage").textContent =
          firebaseError(error);
      }
    };
}


/* =========================
   LOGOUT
   ========================= */

if ($("logoutBtn")) {

  $("logoutBtn").onclick =
    () => signOut(auth);
}


/* =========================
   ABAS LOGIN / CADASTRO
   ========================= */

document
  .querySelectorAll("[data-auth-tab]")
  .forEach(button => {

    button.onclick = () =>
      renderAuthTab(
        button.dataset.authTab
      );
  });


/* =========================
   NAVEGAÇÃO
   ========================= */

function openModule(module) {

  if ($("homeView")) {
    $("homeView").classList.add(
      "hidden"
    );
  }


  if (module === "finance") {
    goPage("dashboard");
  }

  /* TAREFAS REMOVIDAS */
}


function goPage(page) {

  currentPage = page;


  document
    .querySelectorAll(".page")
    .forEach(element => {

      element.classList.toggle(
        "hidden",
        element.id !==
          `page-${page}`
      );
    });


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


  const titles = {

    dashboard:
      "Dashboard",

    transactions:
      "Movimentações",

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


/* =========================
   MÓDULOS
   ========================= */

document
  .querySelectorAll("[data-module]")
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


/* =========================
   PÁGINAS
   ========================= */

document
  .querySelectorAll("[data-page]")
  .forEach(button => {

    button.onclick = () =>
      goPage(
        button.dataset.page
      );
  });


/* =========================
   HOME
   ========================= */

document
  .querySelectorAll("[data-home]")
  .forEach(button => {

    button.onclick = () => {

      if ($("homeView")) {
        $("homeView")
          .classList
          .remove("hidden");
      }
    };
  });


/* =========================
   LINKS DE PÁGINA
   ========================= */

document
  .querySelectorAll("[data-page-link]")
  .forEach(button => {

    button.onclick = () =>
      goPage(
        button.dataset.pageLink
      );
  });


/* =========================
   BOTÕES
   ========================= */

if ($("quickAdd")) {

  $("quickAdd").onclick =
    () => openTransaction();
}


if ($("newGoalBtn")) {

  $("newGoalBtn").onclick =
    () => openModal("goalModal");
}


/* =========================
   FILTRO DE MÊS
   ========================= */

if ($("monthFilter")) {

  $("monthFilter").value =
    selectedMonth;


  $("monthFilter").onchange =
    event => {

      selectedMonth =
        event.target.value;

      renderDashboard();
    };
}


/* =========================
   FILTROS
   ========================= */

if ($("searchTransactions")) {

  $("searchTransactions")
    .oninput =
    renderTransactions;
}


if ($("typeFilter")) {

  $("typeFilter").onchange =
    renderTransactions;
}


if ($("categoryFilter")) {

  $("categoryFilter").onchange =
    renderTransactions;
}


/* =========================
   BOTÕES DE TIPO
   ========================= */

document
  .querySelectorAll(".type-btn")
  .forEach(button => {

    button.onclick = () =>
      setTransactionType(
        button.dataset.type
      );
  });


/* =========================
   FECHAR MODAIS
   ========================= */

document
  .querySelectorAll(".close-modal")
  .forEach(button => {

    button.onclick = () =>
      closeModal(
        button.closest(".modal")
      );
  });


document
  .querySelectorAll(".modal")
  .forEach(modal => {

    modal.addEventListener(
      "click",
      event => {

        if (
          event.target === modal
        ) {
          closeModal(modal);
        }
      }
    );
  });


/* =========================
   MENU MOBILE
   ========================= */

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


/* =========================
   TROCAR SENHA
   ========================= */

if ($("changePasswordBtn")) {

  $("changePasswordBtn").onclick =
    async () => {

      if (!user) return;

      try {

        await sendPasswordResetEmail(
          auth,
          user.email
        );

        showToast(
          "E-mail para troca de senha enviado."
        );

      } catch (error) {

        showToast(
          firebaseError(error),
          "error"
        );
      }
    };
}


/* =========================
   EXPORTAR DADOS
   ========================= */

if ($("exportBtn")) {

  $("exportBtn").onclick = () => {

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


    const url =
      URL.createObjectURL(blob);


    const link =
      document.createElement("a");


    link.href = url;

    link.download =
      `controle-financeiro-${today()}.json`;


    link.click();


    URL.revokeObjectURL(url);
  };
}


/* =========================
   APAGAR DADOS
   ========================= */

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
            item => [
              "transactions",
              item.id
            ]
          ),

          ...goals.map(
            item => [
              "goals",
              item.id
            ]
          ),

          ...fixedExpenses.map(
            item => [
              "fixedExpenses",
              item.id
            ]
          ),

          ...categories.map(
            item => [
              "categories",
              item.id
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

        console.error(error);

        showToast(
          firebaseError(error),
          "error"
        );
      }
    };
}


/* =========================
   GASTOS FIXOS / CATEGORIAS
   ========================= */

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
    async event => {

      event.preventDefault();


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

        console.error(error);

        showToast(
          firebaseError(error),
          "error"
        );
      }
    };
}


/* =========================
   AUTENTICAÇÃO PRINCIPAL
   ========================= */

onAuthStateChanged(
  auth,
  async currentUser => {

    setLoading(true);


    try {

      if (currentUser) {

        user = currentUser;


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
                currentUser.displayName ||
                "Usuário"
              )}
            </strong>

            <small>
              ${escapeHtml(
                currentUser.email ||
                ""
              )}
            </small>
          `;
        }


        if ($("accountInfo")) {

          $("accountInfo").innerHTML = `
            <strong>
              ${escapeHtml(
                currentUser.displayName ||
                "Usuário"
              )}
            </strong>

            <small>
              ${escapeHtml(
                currentUser.email ||
                ""
              )}
            </small>
          `;
        }


        if ($("welcomeText")) {

          $("welcomeText").textContent =
            `Olá, ${
              currentUser.displayName ||
              "Usuário"
            }!`;
        }


        listenData();

        goPage("dashboard");

      } else {

        user = null;


        unsubscribers.forEach(
          unsubscribe =>
            unsubscribe()
        );

        unsubscribers = [];


        transactions = [];
        categories = [];
        goals = [];
        fixedExpenses = [];


        if ($("authView")) {

          $("authView")
            .classList
            .remove("hidden");
        }


        if ($("appView")) {

          $("appView")
            .classList
            .add("hidden");
        }
      }

    } catch (error) {

      console.error(
        "Erro ao iniciar aplicação:",
        error
      );

      if ($("authMessage")) {

        $("authMessage").textContent =
          "Erro ao carregar o sistema. Verifique o console.";
      }

    } finally {

      setLoading(false);
    }
  }
);
