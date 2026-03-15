output "cloud_run_service_name" {
  description = "Name of the Cloud Run service."
  value       = google_cloud_run_v2_service.api.name
}

output "cloud_run_uri" {
  description = "Deployed Cloud Run service URI."
  value       = google_cloud_run_v2_service.api.uri
}

output "secret_ids" {
  description = "Secret Manager secret identifiers relevant to this deployment."
  value = {
    oauth_client_secret = google_secret_manager_secret.oauth_client_secret.id
  }
}

output "firestore" {
  description = "Firestore database details when managed by Terraform."
  value = var.enable_firestore_database ? {
    database_name = google_firestore_database.default[0].name
    location_id   = google_firestore_database.default[0].location_id
    type          = google_firestore_database.default[0].type
  } : null
}
