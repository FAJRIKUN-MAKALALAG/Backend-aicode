pipeline {
    agent any

    options {
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '5'))
        disableConcurrentBuilds()
    }

    // Menggunakan NodeJS yang sudah Anda daftarkan di Global Tool Configuration dengan nama "node"
    tools {
        nodejs "node"
    }

    environment {
        BACKEND_DIR  = "/var/www/unklab-backend"
        PM2_NAME     = "aicode-backend"
        BACKEND_PORT = "3000"
        // Memastikan PM2 dan Node masuk dalam path eksekusi
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
                    pm2 -v
                '''
            }
        }

        stage('Create .env') {
            steps {
                // Pastikan ID di Credentials Jenkins (Secret Text) sudah benar:
                // SUPABASE_URL, SUPABASE_KEY, ENCRYPTION_KEY
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
                        
                        # Verifikasi apakah file .env berhasil dibuat (tanpa membocorkan isinya)
                        if [ -f .env ]; then
                            echo "✅ File .env berhasil dibuat"
                        else
                            echo "❌ Gagal membuat file .env"
                            exit 1
                        fi
                    """
                }
            }
        }

        stage('Deploy Files') {
            steps {
                sh """
                    # Pastikan folder tujuan ada dan dimiliki user jenkins
                    mkdir -p ${BACKEND_DIR}
                    
                    # Sinkronisasi file proyek ke folder deployment
                    rsync -az --delete \
                      --exclude node_modules \
                      --exclude .git \
                      --exclude Jenkinsfile \
                      ./ ${BACKEND_DIR}/

                    # Pindahkan .env ke folder tujuan
                    mv .env ${BACKEND_DIR}/.env
                """
            }
        }

        stage('Install & Restart Application') {
            steps {
                dir("${BACKEND_DIR}") {
                    sh """
                        # Install dependencies (menggunakan clean install untuk stabilitas)
                        npm install --omit=dev

                        # Cek apakah aplikasi sudah berjalan di PM2
                        if pm2 describe ${PM2_NAME} > /dev/null; then
                            echo "🔄 Reloading ${PM2_NAME}..."
                            pm2 reload ${PM2_NAME} --update-env
                        else
                            echo "🚀 Starting ${PM2_NAME} for the first time..."
                            # Jalankan server.js (pastikan file utama Anda bernama server.js)
                            pm2 start server.js --name ${PM2_NAME}
                        fi
                        
                        # Simpan daftar proses agar otomatis jalan saat VPS restart
                        pm2 save
                    """
                }
            }
        }
    }

    post {
        success {
            echo "✅ DEPLOY BERHASIL!"
            echo "Aplikasi berjalan di: http://api.unklab-ai.online"
        }
        failure {
            echo "❌ DEPLOY GAGAL!"
            echo "Saran: Jalankan 'pm2 logs ${PM2_NAME}' di VPS untuk melihat error."
        }
    }
}