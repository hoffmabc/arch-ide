variable "dns_region" {
  type    = string
  default = "us-east-1"
}

variable "dns_profile" {
  type    = string
  default = ""
}

variable "zone_name" {
  type        = string
  description = "test.arch.network."
}

variable "hostname" {
  type        = string
  description = "ide.test.arch.network"
}

variable "distribution_domain" {
  type = string
}
