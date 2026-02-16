pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '5'))
    disableConcurrentBuilds()
  }

  triggers {
    githubPush()
  }

  environment {
    BACKEND_DIR = "/srv/backend/backend-aicode"
    PM2_NAME    = "aicode-backend"
    PORT        = "3000"
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Verify Environment') {
      steps {
        sh '''
          node -v
          npm -v
          pm2 -v
        '''
      }
    }

    stage('Create .env') {
      steps {
        withCredentials([
          string(credentialsId: 'SUPABASE_URL', variable: 'SUPA_URL'),
          string(credentialsId: 'SUPABASE_KEY', variable: 'SUPA_KEY'),
          string(credentialsId: 'ENCRYPTION_KEY', variable: 'ENC_KEY'),
        ]) {
          sh """
cat > .env << EOF
PORT=${PORT}
SUPABASE_URL="${SUPA_URL}"
SUPABASE_KEY="${SUPA_KEY}"
ENCRYPTION_KEY="${ENC_KEY}"

EOF
"""
        }
      }
    }

    stage('Deploy') {
      steps {
        sh """
mkdir -p ${BACKEND_DIR}

rsync -az --delete \
  --exclude node_modules \
  --exclude .git \
  --exclude Jenkinsfile \
  ./ ${BACKEND_DIR}/

mv .env ${BACKEND_DIR}/.env
"""
      }
    }

    stage('Install & Restart') {
      steps {
        dir("${BACKEND_DIR}") {
          sh """
npm ci --production

if pm2 describe ${PM2_NAME} > /dev/null; then
  pm2 reload ${PM2_NAME} --update-env
else
  pm2 start server.js --name ${PM2_NAME}
fi

pm2 save
"""
        }
      }
    }
  }

  post {
    success { echo "✅ DEPLOY SUCCESS" }
    failure { echo "❌ DEPLOY FAILED" }
  }
}
