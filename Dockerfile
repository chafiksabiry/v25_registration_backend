# Utiliser une image Node.js légère
FROM node:18-alpine

# Définir le répertoire de travail dans le conteneur
WORKDIR /app

# Copier uniquement les fichiers nécessaires pour installer les dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier tout le reste du projet dans le conteneur
COPY . .

# Définir les variables d'environnement
ENV VITE_OPENAI_API_KEY=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
ENV LINKEDIN_CLIENT_ID=78dci2o5ppds4v
ENV LINKEDIN_CLIENT_SECRET=WPL_AP1.T45rXV4XwyxtS5pl.cTa72w==
#ENV VITE_LINKEDIN_REDIRECT_URI=http://localhost:5173/linkedin-callback
ENV JWT_SECRET=your_jwt_secret_key_here

ENV VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVibXVzZXJua2tzYm54aHZzZ294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcwNTg4NDMsImV4cCI6MjA1MjYzNDg0M30.EtRoTBjDoEOmYvDKVfgKjcXN2mUcxkpFucEOAnEpl78
ENV VITE_SUPABASE_URL=https://ubmusernkksbnxhvsgox.supabase.co
ENV TWILIO_PHONE_NUMBER=+16185185941
ENV MONGODB_URI=mongodb://harx:gcZ62rl8hoME@38.242.208.242:27018/V25_CompanySearchWizard
ENV PORT=5000
ENV FRONTEND_URL=https://registration.harx.ai/auth
ENV CORS_ORIGIN=https://registration.harx.ai
#ENV FRONTEND_URL=http:localhost:5157/auth
#ENV CORS_ORIGIN=http:localhost:5157
ENV BREVO_API_KEY=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
ENV BREVO_FROM_EMAIL=chafik.sabiry@harx.ai
ENV SMTP_SENDER_NAME=harx
# Exposer le port utilisé par votre backend
EXPOSE 5000

# Démarrer l'application
CMD ["npm", "start"]
