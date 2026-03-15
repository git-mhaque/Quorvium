resource "google_firestore_database" "default" {
  count    = var.enable_firestore_database ? 1 : 0
  provider = google-beta
  project  = var.project_id

  name        = var.firestore_database_name
  location_id = var.firestore_location != "" ? var.firestore_location : var.region
  type        = "FIRESTORE_NATIVE"

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [
    google_project_service.required
  ]
}
