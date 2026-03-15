resource "google_project_service" "required" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "compute.googleapis.com",
    "firestore.googleapis.com"
  ])

  service            = each.value
  disable_on_destroy = false
}
