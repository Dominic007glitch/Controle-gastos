import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  sendPasswordResetEmail as resetPassword
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp, setDoc, getDoc,
  writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";


let expensesChart = null;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);




function renderExpensesChart(transactions) {
    const canvas = document.getElementById("expensesChart");

    if (!canvas) return;

    const expenses = transactions.filter(transaction => {
        return transaction.type === "expense";
    });

    const categoryTotals = {};

    expenses.forEach(transaction => {
        const category = transaction.category || "Outros";
        const amount = Number(transaction.amount) || 0;

        if (!categoryTotals[category]) {
            categoryTotals[category] = 0;
        }

        categoryTotals[category] += amount;
    });

    const labels = Object.keys(categoryTotals);
    const values = Object.values(categoryTotals);

    if (expensesChart) {
        expensesChart.destroy();
    }

    expensesChart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: labels,
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
                        label: function(context) {
                            const value = context.raw;

                            return " R$ " + value.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2
                            });
                        }
                    }
                }
            }
        }
    });
}




const defaultCategories = [
  "Alimentação","Roupas","Acessórios","Moto","Transporte","Lazer",
  "Tecnologia","Casa","Estudos","Saúde","Contas","Outros"
];

let user = null;
let transactions = [];
let categories = [];
let goals = [];
let fixedExpenses = [];
let unsubscribers = [];
let currentPage = "dashboard";
let selectedMonth = new Date().toISOString().slice(0,7);

const $ = id => document.getElementById(id);
const money = n => Number(n || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const today = () => new Date().toISOString().slice(0,10);
const monthOf = date => String(date || "").slice(0,7);

function showToast(msg, type="ok") {
  const el=$("toast"); el.textContent=msg; el.className=`toast show ${type}`;
  setTimeout(()=>el.className="toast",3000);
}
function setLoading(show){$("loading").classList.toggle("hidden",!show);}
function userRef(){ return doc(db,"users",user.uid); }
function sub(name){ return collection(db,"users",user.uid,name); }

function openModal(id){$(id).classList.remove("hidden");}
function closeModal(modal){modal.classList.add("hidden");}
function closeAllModals(){document.querySelectorAll(".modal").forEach(m=>m.classList.add("hidden"));}

function renderAuthTab(tab){
  document.querySelectorAll(".auth-tabs .tab").forEach(b=>b.classList.toggle("active",b.dataset.authTab===tab));
  $("loginForm").classList.toggle("hidden",tab!=="login");
  $("registerForm").classList.toggle("hidden",tab!=="register");
  $("authMessage").textContent="";
}

function firebaseError(e){
  const map={
    "auth/invalid-credential":"E-mail ou senha incorretos.",
    "auth/email-already-in-use":"Este e-mail já está cadastrado.",
    "auth/invalid-email":"Digite um e-mail válido.",
    "auth/weak-password":"A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests":"Muitas tentativas. Tente novamente mais tarde.",
    "auth/network-request-failed":"Sem conexão com a internet."
  };
  return map[e.code] || e.message || "Ocorreu um erro.";
}

async function ensureProfile(){
  const ref=userRef(), snap=await getDoc(ref);
  if(!snap.exists()) await setDoc(ref,{name:user.displayName||"Usuário",email:user.email,createdAt:serverTimestamp()});
}

function listenData(){
  unsubscribers.forEach(fn=>fn());
  unsubscribers=[];
  const listen=(name, setter, sortField="createdAt")=>{
    const q=query(sub(name),orderBy(sortField,"desc"));
    const unsub=onSnapshot(q,s=>{setter(s.docs.map(d=>({id:d.id,...d.data()}))); renderAll();},e=>{
      // A primeira versão pode funcionar mesmo antes de índices. Se o índice faltar, tente sem orderBy.
      const fallback=onSnapshot(sub(name),s=>{setter(s.docs.map(d=>({id:d.id,...d.data()})));renderAll();});
      unsubscribers.push(fallback);
      console.error(e);
    });
    unsubscribers.push(unsub);
  };
  listen("transactions",v=>transactions=v);
  listen("goals",v=>goals=v);
  listen("fixedExpenses",v=>fixedExpenses=v);
  const catUnsub=onSnapshot(sub("categories"),s=>{
    categories=s.docs.map(d=>({id:d.id,...d.data()}));
    if(!categories.length) seedCategories();
    renderAll();
  });
  unsubscribers.push(catUnsub);
}

async function seedCategories(){
  const batch=writeBatch(db);
  defaultCategories.forEach(name=>batch.set(doc(sub("categories")), {name,createdAt:serverTimestamp()}));
  await batch.commit();
}

.home-view{
  position:fixed;
  inset:0;
  background:var(--bg);
  display:grid;
  place-items:center;
  padding:30px;
  z-index:40;
  overflow:auto;
}

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("authMessage").textContent="Entrando...";
  try{await signInWithEmailAndPassword(auth,$("loginEmail").value,$("loginPassword").value);}
  catch(err){$("authMessage").textContent=firebaseError(err);}
});
$("registerForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("authMessage").textContent="Criando conta...";
  try{
    const cred=await createUserWithEmailAndPassword(auth,$("registerEmail").value,$("registerPassword").value);
    await setDoc(doc(db,"users",cred.user.uid),{name:$("registerName").value.trim(),email:cred.user.email,createdAt:serverTimestamp()});
  }catch(err){$("authMessage").textContent=firebaseError(err);}
});
$("forgotPassword").onclick=async()=>{
  const email=$("loginEmail").value.trim();
  if(!email) return $("authMessage").textContent="Digite seu e-mail primeiro.";
  try{await sendPasswordResetEmail(auth,email);$("authMessage").textContent="E-mail de recuperação enviado.";}catch(e){$("authMessage").textContent=firebaseError(e);}
};
$("logoutBtn").onclick=()=>signOut(auth);
document.querySelectorAll("[data-auth-tab]").forEach(b=>b.onclick=()=>renderAuthTab(b.dataset.authTab));

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

function getTypeLabel(t){return {income:"Entrada",expense:"Gasto",save:"Guardou",withdraw:"Retirou da reserva"}[t]||t;}
function signedAmount(t,v){return t==="income"||t==="withdraw" ? Number(v) : -Number(v);}
function monthTransactions(){return transactions.filter(t=>monthOf(t.date)===selectedMonth);}
function totalSaved(){
  return transactions.reduce((a,t)=>a+(t.type==="save"?Number(t.amount):t.type==="withdraw"?-Number(t.amount):0),0);
}
function totalBalance(){
  const all=transactions.reduce((a,t)=>a+signedAmount(t.type,t.amount),0);
  // save reduces available balance; withdraw increases it through signedAmount already.
  return all;
}
function renderAll(){
  renderDashboard(); renderTransactions(); renderGoals(); renderSettings(); populateCategories();
}

function renderDashboard(){
  const mt=monthTransactions();
  const income=mt.filter(t=>t.type==="income").reduce((a,t)=>a+Number(t.amount),0);
  const expenses=mt.filter(t=>t.type==="expense").reduce((a,t)=>a+Number(t.amount),0);
  $("balance").textContent=money(totalBalance());
  $("saved").textContent=money(totalSaved());
  $("income").textContent=money(income);
  $("expenses").textContent=money(expenses);


renderExpensesChart(transactions);
  

  const by={};
  mt.filter(t=>t.type==="expense").forEach(t=>by[t.category||"Outros"]=(by[t.category||"Outros"]||0)+Number(t.amount));
  const entries=Object.entries(by).sort((a,b)=>b[1]-a[1]);
  $("categoryChart").className=entries.length?"bar-chart":"bar-chart empty-state";
  $("categoryChart").innerHTML=entries.length?entries.map(([name,val])=>{
    const max=entries[0][1]||1;
    return `<div class="bar-row"><div><span>${escapeHtml(name)}</span><strong>${money(val)}</strong></div><div class="bar"><i style="width:${Math.max(3,val/max*100)}%"></i></div></div>`;
  }).join(""):"Nenhum gasto neste mês.";

  const savedThis=mt.filter(t=>t.type==="save").reduce((a,t)=>a+Number(t.amount),0);
  $("summaryList").innerHTML=`
    <div><span>Gastos</span><strong>${money(expenses)}</strong></div>
    <div><span>Entradas</span><strong>${money(income)}</strong></div>
    <div><span>Guardado neste mês</span><strong>${money(savedThis)}</strong></div>
    <div><span>Resultado do mês</span><strong>${money(income-expenses-savedThis)}</strong></div>`;

  const recent=[...transactions].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,6);
  $("recentTransactions").innerHTML=recent.length?recent.map(transactionHtml).join(""):`<div class="empty-state">Nenhuma movimentação registrada.</div>`;
}

function transactionHtml(t){
  const positive=t.type==="income"||t.type==="withdraw";
  return `<div class="transaction">
    <div class="transaction-icon ${t.type}">${t.type==="income"?"↑":t.type==="expense"?"↓":t.type==="save"?"$":"↩"}</div>
    <div class="transaction-main"><strong>${escapeHtml(t.description)}</strong><small>${escapeHtml(t.category||getTypeLabel(t.type))} · ${formatDate(t.date)}</small></div>
    <strong class="${positive?"positive":"negative"}">${positive?"+":"-"}${money(t.amount)}</strong>
    <button class="more-btn" data-edit="${t.id}" title="Editar">✎</button>
    <button class="more-btn" data-delete="${t.id}" title="Excluir">×</button>
  </div>`;
}
function formatDate(d){if(!d)return "";const [y,m,day]=d.split("-");return `${day}/${m}/${y}`;}

function renderTransactions(){
  const search=($("searchTransactions").value||"").toLowerCase();
  const type=$("typeFilter").value, cat=$("categoryFilter").value;
  let arr=[...transactions].filter(t=>(!type||t.type===type)&&(!cat||t.category===cat)&&(!search||String(t.description).toLowerCase().includes(search)));
  arr.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  $("transactionCount").textContent=`${arr.length} registro${arr.length!==1?"s":""}`;
  $("allTransactions").innerHTML=arr.length?arr.map(transactionHtml).join(""):`<div class="empty-state">Nenhum registro encontrado.</div>`;
  bindTransactionActions();
}
function bindTransactionActions(){
  document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=async()=>{
    if(!confirm("Excluir esta movimentação?"))return;
    await deleteDoc(doc(sub("transactions"),b.dataset.delete)); showToast("Movimentação excluída.");
  });
  document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editTransaction(b.dataset.edit));
}
function populateCategories(){
  const opts=categories.sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
  $("transactionCategory").innerHTML=opts;
  $("categoryFilter").innerHTML=`<option value="">Todas as categorias</option>${opts}`;
}
function setTransactionType(type){
  $("transactionType").value=type;
  document.querySelectorAll(".type-btn").forEach(b=>b.classList.toggle("active",b.dataset.type===type));
  $("transactionCategoryWrap").classList.toggle("hidden",type==="save"||type==="withdraw");
  $("paymentMethod").closest("label").classList.toggle("hidden",type==="save"||type==="withdraw");
}

function openTransaction(type="expense"){
  $("transactionForm").reset(); $("transactionId").value=""; $("transactionDate").value=today();
  $("transactionModalTitle").textContent="Adicionar movimentação";
  setTransactionType(type); openModal("transactionModal");
}
function editTransaction(id){
  const t=transactions.find(x=>x.id===id); if(!t)return;
  $("transactionId").value=id;$("transactionAmount").value=t.amount;$("transactionDescription").value=t.description;
  $("transactionDate").value=t.date;$("paymentMethod").value=t.paymentMethod||"Pix";$("transactionNote").value=t.note||"";
  setTransactionType(t.type); if(t.category)$("transactionCategory").value=t.category;
  $("transactionModalTitle").textContent="Editar movimentação"; openModal("transactionModal");
}
$("transactionForm").onsubmit=async e=>{
  e.preventDefault();
  const id=$("transactionId").value;
  const data={type:$("transactionType").value,amount:Number($("transactionAmount").value),description:$("transactionDescription").value.trim(),category:$("transactionCategory").value||"",date:$("transactionDate").value,paymentMethod:$("paymentMethod").value,note:$("transactionNote").value.trim(),updatedAt:serverTimestamp()};
  try{
    if(id) await updateDoc(doc(sub("transactions"),id),data);
    else await addDoc(sub("transactions"),{...data,createdAt:serverTimestamp()});
    closeModal($("transactionModal"));showToast("Movimentação salva.");
  }catch(e){showToast(firebaseError(e),"error");}
};

function renderGoals(){
  $("goalsGrid").innerHTML=goals.length?goals.map(g=>{
    const pct=Math.min(100,(Number(g.current)||0)/(Number(g.target)||1)*100);
    return `<article class="goal-card"><div class="goal-top"><div><h3>${escapeHtml(g.name)}</h3><small>${g.deadline?`Prazo: ${formatDate(g.deadline)}`:"Sem prazo"}</small></div><button class="more-btn" data-goal-delete="${g.id}">×</button></div>
      <div class="goal-values"><strong>${money(g.current)}</strong><span>de ${money(g.target)}</span></div>
      <div class="progress"><i style="width:${pct}%"></i></div><small>${pct.toFixed(0)}% concluído</small>
    </article>`;
  }).join(""):`<div class="empty-state panel">Você ainda não criou nenhuma meta.</div>`;
  document.querySelectorAll("[data-goal-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Excluir esta meta?"))await deleteDoc(doc(sub("goals"),b.dataset.goalDelete));});
}
$("goalForm").onsubmit=async e=>{
  e.preventDefault();
  await addDoc(sub("goals"),{name:$("goalName").value.trim(),target:Number($("goalTarget").value),current:Number($("goalCurrent").value||0),deadline:$("goalDeadline").value||"",createdAt:serverTimestamp()});
  closeModal($("goalModal"));e.target.reset();showToast("Meta criada.");
};

function renderSettings(){
  $("fixedList").innerHTML=fixedExpenses.length?fixedExpenses.map(x=>`<div class="setting-row"><span><strong>${escapeHtml(x.name)}</strong><small>Dia ${x.day||"—"}</small></span><strong>${money(x.amount)}</strong><button class="more-btn" data-fixed-delete="${x.id}">×</button></div>`).join(""):`<div class="empty-state">Nenhum gasto fixo.</div>`;
  $("categoryList").innerHTML=categories.sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<div class="setting-row"><span>${escapeHtml(x.name)}</span><button class="more-btn" data-cat-delete="${x.id}">×</button></div>`).join("");
  document.querySelectorAll("[data-fixed-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Excluir gasto fixo?"))await deleteDoc(doc(sub("fixedExpenses"),b.dataset.fixedDelete));});
  document.querySelectorAll("[data-cat-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Excluir categoria?"))await deleteDoc(doc(sub("categories"),b.dataset.catDelete));});
}
let simpleMode="";
$("newFixedBtn").onclick=()=>{simpleMode="fixed";$("simpleModalTitle").textContent="Novo gasto fixo";$("simpleValueLabel").classList.remove("hidden");$("simpleDayLabel").classList.remove("hidden");$("simpleName").value="";$("simpleValue").value="";$("simpleDay").value="";openModal("simpleModal");};
$("newCategoryBtn").onclick=()=>{simpleMode="category";$("simpleModalTitle").textContent="Nova categoria";$("simpleValueLabel").classList.add("hidden");$("simpleDayLabel").classList.add("hidden");$("simpleName").value="";openModal("simpleModal");};
$("simpleForm").onsubmit=async e=>{
  e.preventDefault();
  if(simpleMode==="fixed") await addDoc(sub("fixedExpenses"),{name:$("simpleName").value.trim(),amount:Number($("simpleValue").value),day:Number($("simpleDay").value||0),createdAt:serverTimestamp()});
  else await addDoc(sub("categories"),{name:$("simpleName").value.trim(),createdAt:serverTimestamp()});
  closeModal($("simpleModal"));showToast("Salvo.");
};





function openModule(module){

  $("homeView").classList.add("hidden");

  if(module === "finance"){

    /*
      Abre o sistema financeiro.
    */
    goPage("dashboard");

  }

  if(module === "tasks"){

    /*
      Abre a área de tarefas.
    */
    goPage("tasks");

  }

}









function goPage(page){

  currentPage=page;

  /*
    Esconde todas as páginas.
  */
  document.querySelectorAll(".page").forEach(p=>{
    p.classList.toggle(
      "hidden",
      p.id !== `page-${page}`
    );
  });


  /*
    Marca a página atual na sidebar.
  */
  document.querySelectorAll(".nav-item[data-page]").forEach(button=>{
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });


  /*
    Título da página.
  */
  const titles={

    dashboard:"Dashboard",

    transactions:"Movimentações",

    tasks:"Tarefas",

    goals:"Metas",

    settings:"Configurações"

  };


  $("pageTitle").textContent=titles[page] || "Meu Controle";

}  




document.querySelectorAll("[data-module]").forEach(button=>{

  button.addEventListener("click",()=>{

    openModule(button.dataset.module);

  });

});






document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>goPage(b.dataset.page));



document.querySelectorAll("[data-home]").forEach(button=>{

  button.onclick=()=>{

    $("homeView").classList.remove("hidden");

  };

});




document.querySelectorAll("[data-page-link]").forEach(b=>b.onclick=()=>goPage(b.dataset.pageLink));
$("quickAdd").onclick=()=>openTransaction();
$("newGoalBtn").onclick=()=>openModal("goalModal");
$("monthFilter").value=selectedMonth;
$("monthFilter").onchange=e=>{selectedMonth=e.target.value;renderDashboard();};
$("searchTransactions").oninput=renderTransactions;$("typeFilter").onchange=renderTransactions;$("categoryFilter").onchange=renderTransactions;
document.querySelectorAll(".type-btn").forEach(b=>b.onclick=()=>setTransactionType(b.dataset.type));
document.querySelectorAll(".close-modal").forEach(b=>b.onclick=()=>closeModal(b.closest(".modal")));
document.querySelectorAll(".modal").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)closeModal(m);}));
$("mobileMenu").onclick=()=>document.querySelector(".sidebar").classList.toggle("open");

$("changePasswordBtn").onclick=async()=>{try{await resetPassword(auth,user.email);showToast("E-mail para troca de senha enviado.");}catch(e){showToast(firebaseError(e),"error");}};

$("exportBtn").onclick=()=>{
  const data={exportedAt:new Date().toISOString(),transactions,categories,goals,fixedExpenses};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`controle-financeiro-${today()}.json`;a.click();URL.revokeObjectURL(a.href);
};

$("deleteDataBtn").onclick=async()=>{
  if(!confirm("Isso apagará suas movimentações, metas, categorias e gastos fixos. Continuar?"))return;
  const all=[...transactions.map(x=>["transactions",x.id]),...goals.map(x=>["goals",x.id]),...fixedExpenses.map(x=>["fixedExpenses",x.id]),...categories.map(x=>["categories",x.id])];
  const batch=writeBatch(db);all.forEach(([c,id])=>batch.delete(doc(db,"users",user.uid,c,id)));
  await batch.commit();await seedCategories();showToast("Dados apagados.");
};
