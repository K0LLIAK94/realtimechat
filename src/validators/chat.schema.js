import Joi from "joi";

export const chatSchema = Joi.object({
  name: Joi.string().min(1).required()
});
