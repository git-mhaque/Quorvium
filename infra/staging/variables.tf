variable "project_id" {
  description = "Google Cloud project ID."
  type        = string
}

variable "region" {
  description = "Primary region for Cloud Run and supporting services."
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment identifier (e.g., staging, production)."
  type        = string
  default     = "staging"
}

variable "service_name" {
  description = "Base name used for resources such as the Cloud Run service."
  type        = string
  default     = "quorvium-api"
}

variable "cloud_run_image" {
  description = "Bootstrap container image used when Terraform creates the Cloud Run service for the first time. CI/CD deploys replace this image after first apply."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello:latest"
}

variable "cloud_run_max_instances" {
  description = "Maximum number of Cloud Run instances to autoscale."
  type        = number
  default     = 5
}

variable "cloud_run_cpu" {
  description = "Requested CPU allocation for Cloud Run container."
  type        = string
  default     = "1"
}

variable "cloud_run_memory" {
  description = "Requested memory allocation for Cloud Run container."
  type        = string
  default     = "512Mi"
}

variable "oauth_client_secret_secret_id" {
  description = "Secret ID for the Google OAuth client secret in Secret Manager."
  type        = string
  default     = "google-oauth-client-secret"
}

variable "enable_firestore_database" {
  description = "Whether Terraform should provision the Firestore database for this environment."
  type        = bool
  default     = false
}

variable "firestore_location" {
  description = "Firestore database location (region or multi-region identifier)."
  type        = string
  default     = ""
}

variable "firestore_database_name" {
  description = "Firestore database ID. Use (default) unless multiple-database mode is intentionally required."
  type        = string
  default     = "(default)"
}
