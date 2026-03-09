locals {
  resource_suffix = format("%s-%s", var.service_name, var.environment)

  service_account_id = substr(
    replace(
      replace(
        replace(lower(local.resource_suffix), "_", "-"),
        ".",
        "-"
      ),
      " ",
      "-"
    ),
    0,
    30
  )
}
