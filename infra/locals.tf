locals {
  resource_suffix = format("%s-%s", var.service_name, var.environment)

  service_account_id = substr(regexreplace(lower(local.resource_suffix), "[^a-z0-9-]", "-"), 0, 30)
}
