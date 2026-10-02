# Meu Controle Financeiro

Site estático para GitHub Pages usando Firebase Authentication + Cloud Firestore.

## 1. Criar o projeto Firebase

No Firebase Console:

1. Crie um projeto.
2. Adicione um aplicativo Web (`</>`).
3. Copie a configuração do Firebase.
4. Cole os valores em `firebase-config.js`.
5. Em Authentication > Sign-in method, ative **E-mail/Senha**.
6. Em Firestore Database, crie o banco.
7. Publique as regras de `firestore.rules`.

## 2. Publicar no GitHub Pages

Envie estes arquivos para um repositório:

- `index.html`
- `style.css`
- `app.js`
- `firebase-config.js`
- `firestore.rules`
- `README.md`

Depois, no GitHub:
Settings > Pages > Deploy from a branch > escolha `main` e `/root`.

## Importante

A configuração Web do Firebase pode ficar no frontend. Ela não é uma senha.
Nunca coloque no repositório uma service account, chave privada ou arquivo de credenciais administrativas.

## Estrutura dos dados

Cada usuário tem sua própria coleção:

users/{uid}/transactions
users/{uid}/categories
users/{uid}/goals
users/{uid}/fixedExpenses

As regras impedem que um usuário autenticado leia ou altere os dados de outro usuário.
