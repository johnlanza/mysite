//this is function that accepts a function and then executes that function, but catches errors and passes it to next. We can use this to wrap our async functions.
module.exports = (func) => {
  return (req, res, next) => {
    func(req, res, next).catch(next);
  };
};
