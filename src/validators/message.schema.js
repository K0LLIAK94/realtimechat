import Joi from "joi";

export const messageSchema = Joi.object({
  text: Joi.string().min(1).required()
});
