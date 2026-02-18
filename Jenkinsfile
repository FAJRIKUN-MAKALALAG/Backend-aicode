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
        PATH = "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"
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
                ]) {
                    sh """
                        echo "PORT=${BACKEND_PORT}" > .env
                        echo "SUPABASE_URL=${SUPA_URL}" >> .env
                        echo "SUPABASE_KEY=${SUPA_KEY}" >> .env
                        echo "ENCRYPTION_KEY=${ENC_KEY}" >> .env
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