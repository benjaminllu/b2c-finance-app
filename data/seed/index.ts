import { z } from "zod";
import {
  BankSchema,
  BonusOfferSchema,
  CreditCardSchema,
  DepositProductSchema,
  EligibilityRuleSchema,
  IssuerSchema,
  RewardCurrencySchema,
} from "@optima/core";
import issuersJson from "./issuers.json";
import currenciesJson from "./currencies.json";
import cardsJson from "./cards.json";
import banksJson from "./banks.json";
import depositProductsJson from "./deposit-products.json";
import offersJson from "./offers.json";
import rulesJson from "./rules.json";

/** Each seed file and the schema its records must satisfy. */
export const SEED_FILES = {
  issuers: { data: issuersJson, schema: IssuerSchema },
  currencies: { data: currenciesJson, schema: RewardCurrencySchema },
  cards: { data: cardsJson, schema: CreditCardSchema },
  banks: { data: banksJson, schema: BankSchema },
  depositProducts: { data: depositProductsJson, schema: DepositProductSchema },
  offers: { data: offersJson, schema: BonusOfferSchema },
  rules: { data: rulesJson, schema: EligibilityRuleSchema },
} as const;

// Parsed once at import; a bad seed file fails loudly instead of rendering wrong numbers.
export const seed = {
  issuers: z.array(IssuerSchema).parse(issuersJson),
  currencies: z.array(RewardCurrencySchema).parse(currenciesJson),
  cards: z.array(CreditCardSchema).parse(cardsJson),
  banks: z.array(BankSchema).parse(banksJson),
  depositProducts: z.array(DepositProductSchema).parse(depositProductsJson),
  offers: z.array(BonusOfferSchema).parse(offersJson),
  rules: z.array(EligibilityRuleSchema).parse(rulesJson),
};

export type Seed = typeof seed;
