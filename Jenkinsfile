pipeline {
    agent any

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '5'))
        disableConcurrentBuilds()
    }

    tools {
        nodejs "node"
    }

    environment {
        BACKEND_DIR  = "/var/www/unklab-backend"
        PM2_NAME     = "aicode-backend"
        BACKEND_PORT = "3000"
        NODE_ENV     = "production"   // WAJIB: aktifkan SameSite=None + secure cookie
        PATH = "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"
        BACKEND_URL = "https://api.unklab-aicode.online"
        FRONTEND_URL = "https://aicode-unklab.online"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Create .env') {
            steps {
                withCredentials([
                    string(credentialsId: 'SUPABASE_URL', variable: 'SUPA_URL'),
                    string(credentialsId: 'SUPABASE_KEY', variable: 'SUPA_KEY'),
                    string(credentialsId: 'ENCRYPTION_KEY', variable: 'ENC_KEY'),
                    string(credentialsId: 'GROQ_API_KEY', variable: 'GROQ_KEY'),
                    string(credentialsId: 'SUPABASE_ANON_KEY', variable: 'SUPA_ANON_KEY'),
                    string(credentialsId: 'GOOGLE_CLIENT_ID', variable: 'GOOGLE_CLIENT_ID'),
                    string(credentialsId: 'GOOGLE_CLIENT_SECRET', variable: 'GOOGLE_CLIENT_SECRET'),

                ]) {
                    sh """
                        echo "PORT=${BACKEND_PORT}" > .env
                        echo "NODE_ENV=${NODE_ENV}" >> .env
                        echo "SUPABASE_URL=${SUPA_URL}" >> .env
                        echo "SUPABASE_KEY=${SUPA_KEY}" >> .env
                        echo "ENCRYPTION_KEY=${ENC_KEY}" >> .env
                        echo "GROQ_API_KEY=${GROQ_KEY}" >> .env
                        echo "SUPABASE_ANON_KEY=${SUPA_ANON_KEY}" >> .env
                        echo "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}" >> .env
                        echo "GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}" >> .env
                        echo "BACKEND_URL=${BACKEND_URL}" >> .env
                        echo "FRONTEND_URL=${FRONTEND_URL}" >> .env
                        echo "✅ File .env berhasil dibuat"
                    """
                }
            }
        }

        stage('Deploy Files') {
            steps {
                sh """
                    # 1. Pastikan folder tujuan ada
                    mkdir -p ${BACKEND_DIR}
                    
                    # 2. Sync file TANPA node_modules dan TANPA paksa atribut owner/group
                    rsync -az --delete --no-perms --no-owner --no-group \
                      --exclude '.git' \
                      --exclude 'node_modules' \
                      --exclude 'Jenkinsfile' \
                      ./ ${BACKEND_DIR}/
                """
            }
        }

        stage('Install Dependencies on VPS') {
            steps {
                // Jalankan npm install langsung di folder tujuan
                dir("${BACKEND_DIR}") {
                    sh "npm install --omit=dev"
                }
            }
        }

        stage('Restart Application') {
            steps {
                dir("${BACKEND_DIR}") {
                    sh """
                        if pm2 describe ${PM2_NAME} > /dev/null; then
                            echo "🔄 Reloading ${PM2_NAME}..."
                            pm2 reload ${PM2_NAME} --update-env
                        else
                            echo "🚀 Starting ${PM2_NAME}..."
                            pm2 start server.js --name ${PM2_NAME}
                        fi
                        pm2 save
                    """
                }
            }
        }
    }

    post {
        success {
            echo "✅ DEPLOY BERHASIL!"
        }
        failure {
            echo "❌ DEPLOY GAGAL! Periksa izin folder di VPS."
        }
    }
}