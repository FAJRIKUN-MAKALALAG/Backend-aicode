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
    }

    environment {
        // Gunakan path absolut agar Jenkins tidak bingung
        BACKEND_DIR  = "/var/www/unklab-backend"
        PM2_NAME     = "aicode-backend"
        BACKEND_PORT = "3000"
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
                    pm2 -v || echo "PM2 belum terinstall secara global"
                '''
            }
        }

        stage('Deploy Files') {
            steps {
                sh """
                    # Buat folder jika belum ada
                    mkdir -p ${BACKEND_DIR}
                    
                    # Sinkronisasi file 
                    # PENTING: --exclude .env agar file .env di server TIDAK TERHAPUS
                    rsync -az --delete \
                      --exclude node_modules \
                      --exclude .git \
                      --exclude Jenkinsfile \
                      --exclude .env \
                      ./ ${BACKEND_DIR}/
                """
            }
        }

        stage('Install & Restart Application') {
            steps {
                dir("${BACKEND_DIR}") {
                    sh """
                        # Install dependencies hanya untuk produksi
                        npm install --production

                        # Logika restart PM2
                        if pm2 describe ${PM2_NAME} > /dev/null; then
                            echo "Restarting application..."
                            pm2 reload ${PM2_NAME} --update-env
                        else
                            echo "Starting application for the first time..."
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
            echo "✅ DEPLOY SUCCESS: Proyek '${PM2_NAME}' aktif di port ${BACKEND_PORT}"
        }
        failure {
            echo "❌ DEPLOY FAILED: Periksa 'Console Output' untuk detail error."
        }
    }
}