resource "google_secret_manager_secret" "oauth_client_secret" {
  secret_id = var.oauth_client_secret_secret_id

  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_iam_member" "oauth_client_secret_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.oauth_client_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run.email}"
}
