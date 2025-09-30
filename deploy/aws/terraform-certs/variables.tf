variable "app_region" {
  type    = string
  default = "us-east-1"
}

variable "dns_region" {
  type    = string
  default = "us-east-1"
}

variable "app_profile" {
  type    = string
  default = ""
}

variable "dns_profile" {
  type    = string
  default = ""
}

variable "dns_assume_role_arn" {
  type    = string
  default = ""
}

variable "zone_name" {
  type        = string
  description = "Hosted zone with trailing dot"
}

variable "hostname" {
  type = string
}

variable "alb_name" {
  type = string
}
