resource "google_service_account" "cloud_run" {
  account_id   = local.service_account_id
  display_name = "Cloud Run ${var.environment} service account"
}

resource "google_cloud_run_v2_service" "api" {
  name     = local.resource_suffix
  location = var.region

  labels = {
    environment = var.environment
    service     = var.service_name
  }

  template {
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    service_account        = google_service_account.cloud_run.email

    scaling {
      max_instance_count = var.cloud_run_max_instances
    }

    containers {
      image = var.cloud_run_image

      resources {
        cpu_idle = false
        limits = {
          cpu    = var.cloud_run_cpu
          memory = var.cloud_run_memory
        }
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PORT"
        value = "4000"
      }

      env {
        name  = "CLIENT_ORIGIN"
        value = var.client_origin
      }

      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }

      env {
        name  = "GOOGLE_REDIRECT_URI"
        value = var.google_redirect_uri
      }

      env {
        name = "GOOGLE_OAUTH_CLIENT_SECRET"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.oauth_client_secret.id
            version = "latest"
          }
        }
      }

      env {
        name  = "DATA_DIR"
        value = "/tmp/quorvium-data"
      }
    }
  }

  ingress = "INGRESS_TRAFFIC_ALL"

  depends_on = [
    google_project_service.required
  ]
}
