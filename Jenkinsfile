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
        // Gunakan path absolut agar Jenkins tidak bingung
        BACKEND_DIR  = "/var/www/unklab-backend"
        PM2_NAME     = "aicode-backend"
        BACKEND_PORT = "3000"
        // Memastikan Jenkins bisa menemukan Node & PM2
        PATH = "/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"
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

        stage('Create .env') {
            steps {
                // Pastikan ID di credentials Jenkins sama persis dengan yang di bawah ini
                withCredentials([
                    string(credentialsId: 'SUPABASE_URL', variable: 'SUPA_URL'),
                    string(credentialsId: 'SUPABASE_KEY', variable: 'SUPA_KEY'),
                    string(credentialsId: 'ENCRYPTION_KEY', variable: 'ENC_KEY'),
                ]) {
                    sh """
                    cat > .env << EOF
PORT=${BACKEND_PORT}
SUPABASE_URL="${SUPA_URL}"
SUPABASE_KEY="${SUPA_KEY}"
ENCRYPTION_KEY="${ENC_KEY}"
EOF
                    """
                }
            }
        }

        stage('Deploy Files') {
            steps {
                sh """
                    # Buat folder jika belum ada
                    mkdir -p ${BACKEND_DIR}
                    
                    # Sinkronisasi file (abaikan node_modules agar cepat)
                    rsync -az --delete \
                      --exclude node_modules \
                      --exclude .git \
                      --exclude Jenkinsfile \
                      ./ ${BACKEND_DIR}/

                    # Pindahkan file .env yang baru dibuat
                    mv .env ${BACKEND_DIR}/.env
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
                            # Sesuaikan 'server.js' dengan file utama backend Anda (misal: index.js atau app.js)
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