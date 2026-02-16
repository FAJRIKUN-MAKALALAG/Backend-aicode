pipeline {
  agent any

  tools {
    nodejs "node"
  }
  
  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '5'))
    disableConcurrentBuilds()
  }

  triggers {
    githubPush()
    // pollSCM('H/5 * * * *') // Enable if Webhook is not possible
  }

  environment {
    // === CONFIGURATION ===
    // If you are deploying to the SAME server where Jenkins runs:
    BACKEND_DIR  = "/var/www/backend/backend-aicode"
    PM2_NAME     = "aicode-backend"
    PORT         = "3000"
  }

  stages {
    stage('Prepare Environment') {
      steps {
        script {
           echo "🔍 Checking Node.js version..."
           sh "node -v"
           sh "npm -v"
        }
      }
    }

    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Setup Credentials & .env') {
      steps {
        script {
          echo "🔐 Injecting Secrets into .env..."
          
          // Note: GEMINI_API_KEY is optional if you rely solely on User-Provided keys.
          // However, we include it here as a fallback if the credential exists.
          withCredentials([
            string(credentialsId: 'SUPABASE_URL', variable: 'SUPA_URL'),
            string(credentialsId: 'SUPABASE_KEY', variable: 'SUPA_KEY'),
            string(credentialsId: 'ENCRYPTION_KEY', variable: 'ENC_KEY'),
            // We use specific syntax to allow this secret to be missing safely if needed, 
            // but standard 'string' directive fails if missing. 
            // For simplicity, create a dummy/empty credential if not used, or fill it.
            string(credentialsId: 'GEMINI_API_KEY', variable: 'GEMINI_KEY')
          ]) {
            sh """
              cat > .env << EOF
PORT=${PORT}
SUPABASE_URL="${SUPA_URL}"
SUPABASE_KEY="${SUPA_KEY}"
ENCRYPTION_KEY="${ENC_KEY}"
GEMINI_API_KEY="${GEMINI_KEY}"
EOF
            """
          }
          
          // Verify .env created (do not cat content to logs!)
          sh "ls -l .env"
        }
      }
    }

    stage('Deploy') {
      steps {
        script {
          echo "🚀 Deploying to ${BACKEND_DIR}..."
          
          // Ensure target directory exists
          sh "mkdir -p ${BACKEND_DIR}"

          // 1. Sync Files (Using rsync is efficient)
          // Exclude node_modules (re-install on target), .git, and build artifacts
          sh "rsync -av --delete --exclude 'node_modules' --exclude '.git' --exclude 'Jenkinsfile' ./ ${BACKEND_DIR}/"
          
          // 2. Move .env to target
          sh "mv .env ${BACKEND_DIR}/.env"

          // 3. Install & Restart
          dir("${BACKEND_DIR}") {
             echo "📦 Installing Dependencies..."
             sh "npm ci --production --quiet"
             
             echo "🔄 Restarting PM2 Process..."
             // Check if process is running, reload if yes, start if no
             sh """
               if pm2 list | grep -q "${PM2_NAME}"; then
                   pm2 reload ${PM2_NAME} --update-env
               else
                   pm2 start server.js --name "${PM2_NAME}" --update-env
               fi
               pm2 save
             """
          }
        }
      }
    }
  }

  post {
    success { 
      echo "✅ DEPLOYMENT SUCCESSFUL!" 
    }
    failure { 
      echo "❌ DEPLOYMENT FAILED. Check logs." 
    }
  }
}
