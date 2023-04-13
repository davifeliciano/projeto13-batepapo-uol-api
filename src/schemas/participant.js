import Joi from "joi";

const schema = Joi.object({ name: Joi.string().trim() });

export default schema;
