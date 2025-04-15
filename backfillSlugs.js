const mongoose = require("mongoose");
const slugify = require("slugify");
const Book = require("./models/books");
require("dotenv").config();

async function backfillSlugs() {
  await mongoose.connect(process.env.DB_URL);

  const books = await Book.find({ slug: { $exists: false } });
  console.log(`Found ${books.length} books missing slugs.`);

  for (let book of books) {
    const slug = slugify(book.title, { lower: true, strict: true });
    book.slug = slug;
    await book.save();
    console.log(`✅ Slug set for "${book.title}": ${slug}`);
  }

  mongoose.disconnect();
  console.log("All done!");
}

backfillSlugs().catch((err) => {
  console.error("Error backfilling slugs:", err);
  mongoose.disconnect();
});
