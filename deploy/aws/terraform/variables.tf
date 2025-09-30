variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "service_name" {
  description = "ECS service/basename for arch-ide"
  type        = string
  default     = "arch-ide"
}

variable "rust_server_image" {
  description = "ECR image for arch-ide rust-server"
  type        = string
}

variable "https_certificate_arn" {
  description = "ACM cert ARN for HTTPS (optional)"
  type        = string
  default     = ""
}

variable "desired_count" {
  description = "Desired count for rust-server service"
  type        = number
  default     = 1
}

variable "port" {
  description = "Container port for rust-server"
  type        = number
  default     = 8080
}
