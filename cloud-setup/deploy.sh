#!/bin/bash
set -e

# Ensure terraform is installed
if ! command -v terraform >/dev/null 2>&1; then
  echo "Terraform not found, installing..."
  sudo apt-get update -y && sudo apt-get install -y gnupg software-properties-common curl
  curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
  sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
  sudo apt-get update -y && sudo apt-get install -y terraform
fi

# Initialize and apply Terraform
terraform -chdir=cloud-setup init -input=false
terraform -chdir=cloud-setup apply -auto-approve

# Get instance IP
INSTANCE_IP=$(terraform -chdir=cloud-setup output -raw instance_ip)

# Wait for SSH to be ready
until ssh -o StrictHostKeyChecking=no -i ~/.ssh/id_rsa ubuntu@${INSTANCE_IP} echo ready; do
  echo "Waiting for SSH..."
  sleep 5
done

# Copy Dockerfile and site files
scp -o StrictHostKeyChecking=no -i ~/.ssh/id_rsa cloud-setup/Dockerfile cloud-setup/index.html ubuntu@${INSTANCE_IP}:/home/ubuntu/

# Build and run container on remote
ssh -o StrictHostKeyChecking=no -i ~/.ssh/id_rsa ubuntu@${INSTANCE_IP} <<'EOF'
  sudo docker build -t mysite /home/ubuntu
  sudo docker run -d -p 80:80 --name webserver mysite
EOF

echo "Deployment complete. Access the site at http://${INSTANCE_IP}"
