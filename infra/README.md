# Infrastructure

Environment-scoped Terraform lives under this directory.

## Layout

```text
infra/
`-- staging/
    |-- *.tf
    |-- terraform.tfvars
    |-- terraform.tfvars.example
    `-- README.md
```

## Current Environment

- `infra/staging/` is the active Terraform stack.
- It provisions staging Cloud Run, IAM, Secret Manager, and optional Firestore resources.

## Commands (from repo root)

```sh
terraform -chdir=infra/staging init
terraform -chdir=infra/staging plan
terraform -chdir=infra/staging apply
terraform -chdir=infra/staging validate
```

`terraform.tfvars` is intentionally versioned for shared non-secret environment defaults. Keep secrets in Secret Manager and GitHub environment secrets, not in tfvars.
