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
    service_account       = google_service_account.cloud_run.email

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
    }
  }

  ingress = "INGRESS_TRAFFIC_ALL"

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].containers[0].env
    ]
  }

  depends_on = [
    google_project_service.required
  ]
}
