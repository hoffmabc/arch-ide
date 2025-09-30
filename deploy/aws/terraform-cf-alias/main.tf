terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 5.0" }
  }
}

provider "aws" {
  alias  = "dns"
  region = var.dns_region
  profile = var.dns_profile != "" ? var.dns_profile : null
}

data "aws_route53_zone" "this" {
  provider     = aws.dns
  name         = trimsuffix(var.zone_name, ".")
  private_zone = false
}

# CloudFront hosted zone id is global and constant
locals {
  cloudfront_zone_id = "Z2FDTNDATAQYW2"
}

resource "aws_route53_record" "alias" {
  provider = aws.dns
  zone_id  = data.aws_route53_zone.this.zone_id
  name     = var.hostname
  type     = "A"
  allow_overwrite = true
  alias {
    name                   = var.distribution_domain
    zone_id                = local.cloudfront_zone_id
    evaluate_target_health = true
  }
}
