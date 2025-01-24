const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose");

const UserSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
});

//this adds on username and password to the email above
//also gives us methods we an use
//takes care of hash and salt
UserSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", UserSchema);
