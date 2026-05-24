pipeline {
  agent any

  environment {
    CLI_BUILD_PATCH = "${env.BUILD_NUMBER}"
    CLI_PACKAGE_SPEC = '.'
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Verify') {
      steps {
        sh 'npm test'
        sh 'npm run check'
        sh 'npm pack --dry-run'
      }
    }

    stage('Build installer') {
      when {
        anyOf {
          expression { isUnix() && sh(script: 'uname', returnStdout: true).trim() == 'Darwin' }
          expression { !isUnix() }
        }
      }
      steps {
        script {
          if (isUnix()) {
            sh 'PKG_TARGETS="node20-macos-arm64,node20-macos-x64" npm run build'
          } else {
            bat 'set PKG_TARGETS=node20-win-x64&& npm run build'
          }
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'release/*.pkg,release/*.exe,*.tgz', allowEmptyArchive: true
    }
  }
}
