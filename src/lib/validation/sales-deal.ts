import { z } from "zod";

import {
  toFils,
} from "@/src/lib/utils/sales-money";

/* =========================================================
   BIGINT CONSTANTS
========================================================= */

const ZERO_FILS =
  BigInt(0);

/* =========================================================
   CREATE DEAL SCHEMA
========================================================= */

export const createDealSchema =
  z
    .object({
      customerId:
        z
          .string()
          .uuid(
            "Choose a customer."
          ),

      carId:
        z
          .string()
          .uuid(
            "Choose a vehicle."
          ),

      locationId:
        z
          .string()
          .uuid(
            "Choose a showroom."
          ),

      leadId:
        z
          .string()
          .uuid()
          .nullable(),

      ownerId:
        z
          .string()
          .uuid()
          .nullable(),

      proposedPrice:
        z
          .string()
          .trim()
          .max(
            20,
            "That price is too long."
          ),

      discountAmount:
        z
          .string()
          .trim()
          .max(
            20,
            "That discount is too long."
          ),

      notes:
        z
          .string()
          .max(
            2000,
            "Keep the notes under 2,000 characters."
          ),
    })
    .superRefine(
      (
        value,
        ctx
      ) => {
        /* =================================================
           PROPOSED PRICE
        ================================================= */

        const price =
          value.proposedPrice ===
          ""
            ? null
            : toFils(
                value.proposedPrice
              );

        /* =================================================
           DISCOUNT
        ================================================= */

        const discount =
          value.discountAmount ===
          ""
            ? ZERO_FILS
            : toFils(
                value.discountAmount
              );

        /* =================================================
           PRICE VALIDATION
        ================================================= */

        if (
          value.proposedPrice !==
            "" &&
          (
            price === null ||
            price <=
              ZERO_FILS
          )
        ) {
          ctx.addIssue({
            code:
              "custom",

            path: [
              "proposedPrice",
            ],

            message:
              "Enter a price above zero, with at most two decimals.",
          });
        }

        /* =================================================
           DISCOUNT VALIDATION
        ================================================= */

        if (
          discount === null ||
          discount <
            ZERO_FILS
        ) {
          ctx.addIssue({
            code:
              "custom",

            path: [
              "discountAmount",
            ],

            message:
              "Enter a discount of zero or more, with at most two decimals.",
          });

          return;
        }

        /* =================================================
           DISCOUNT REQUIRES PRICE
        ================================================= */

        if (
          value.proposedPrice ===
            "" &&
          discount >
            ZERO_FILS
        ) {
          ctx.addIssue({
            code:
              "custom",

            path: [
              "discountAmount",
            ],

            message:
              "Enter the proposed price before adding a discount.",
          });

          return;
        }

        /* =================================================
           DISCOUNT CANNOT EXCEED PRICE
        ================================================= */

        if (
          price !== null &&
          price >
            ZERO_FILS &&
          discount >
            price
        ) {
          ctx.addIssue({
            code:
              "custom",

            path: [
              "discountAmount",
            ],

            message:
              "The discount can't be more than the price.",
          });
        }
      }
    );

/* =========================================================
   TYPE
========================================================= */

export type CreateDealValues =
  z.infer<
    typeof createDealSchema
  >;