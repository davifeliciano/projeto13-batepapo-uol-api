import Joi from "joi";

const schema = Joi.object({
  to: Joi.string().trim().required(),
  text: Joi.string().trim().required(),
  type: Joi.string().valid("message", "private_message").required(),
});

export default schema;
