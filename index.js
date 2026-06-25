const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { jwtVerify, createRemoteJWKSet } = require("jose-cjs");

const app = express();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());


app.get("/", (req, res) => {
  res.send("Fable Ebook Server Running...");
});


const uri = process.env.MONGO_DB_URI;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});




const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;

    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ msg: "Unauthorized" });
  }
};


let db;
let ebooksCollection;
let usersCollection; 
let purchasesCollection;
let sessionCollection;
let booksCollection;
let bookmarksCollection;

db = client.db(process.env.AUTH_DB_NAME);
ebooksCollection = db.collection("ebooks");
usersCollection = db.collection("user"); 
purchasesCollection = db.collection("purchases");
booksCollection= db.collection("booksCollection")
sessionCollection = db.collection('session');
bookmarksCollection= db.collection('bookmarksCollection')

console.log("MongoDB Connected Successfully");
// console.log("DB Name:", db.databaseName);
const verifySessionToken = async (req, res, next) => {

            const authHeader = req.headers?.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const token = authHeader.split(' ')[1]

            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const query = { token: token }
            const session = await sessionCollection.findOne(query);

              if (!session) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            const userId = session.userId;


            const userQuery = {
                _id: userId
            }

            const user = await usersCollection.findOne(userQuery);
              if (!user) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            // console.log(user)
            // set data in the req object
            req.user = user;
            next();
        }







app.get("/ebooks/featured", async (req, res) => {
  try {
    const result = await ebooksCollection
      .find()
      .sort({ createdAt: -1 }) 
      .limit(6)
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to get featured ebooks" });
  }
});



app.patch("/users/verify-writer", async (req, res) => {
  const { email } = req.body;

  await usersCollection.updateOne(
    { email },
    {
      $set: {
        role: "writer",
        writerVerified: true
      }
    }
  );

  res.send({ success: true });


});


app.patch('/users/:id/role', async (req, res) => {
    const id = req.params.id;
    const { role } = req.body;
    
    try {
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: {
                role: role
            },
        };
        const result = await usersCollection.updateOne(query, updateDoc);
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: "Failed to update role" });
    }
});







app.get("/ebooks", async (req, res) => {
  try {
    const { search, genre, minPrice, maxPrice, availability, sortBy, page = 1, limit = 6 } = req.query;

    let query = {};

  
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } }
      ];
    }

    if (genre) {
      query.genre = genre;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (availability) {
      query.availability = availability;
    }

    let sortObj = {};
    if (sortBy === "newest") {
      sortObj._id = -1; 
    } else if (sortBy === "priceLowHigh") {
      sortObj.price = 1;
    } else if (sortBy === "priceHighLow") {
      sortObj.price = -1;
    } else {
      sortObj._id = -1;
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    const totalBooks = await ebooksCollection.countDocuments(query);
    const books = await ebooksCollection
      .find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    res.send({
      books,
      totalBooks,
      totalPages: Math.ceil(totalBooks / limitNum),
      currentPage: pageNum
    });
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch ebooks" });
  }
});




app.get("/ebooks/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await ebooksCollection.findOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to get ebook" });
  }
});



app.post("/ebooks", verifySessionToken, async (req, res) => {
  try {
    const data = req.body;

    const result = await ebooksCollection.insertOne({
      ...data,
      createdAt: new Date(),
      status: "published", 
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to add ebook" });
  }
});



app.put("/ebooks/:id",  verifySessionToken, async (req, res) => {
  try {
    const id = req.params.id;
    const updatedData = req.body;
    
    delete updatedData._id;

    const result = await ebooksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    if (result.modifiedCount === 1 || result.matchedCount === 1) {
      res.send({ success: true, message: "Ebook updated successfully" });
    } else {
      res.status(404).send({ error: "Ebook not found or no changes made" });
    }
  } catch (error) {
    res.status(500).send({ error: "Failed to update ebook" });
  }
});



app.patch("/ebooks/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body; 

    const filter = { _id: new ObjectId(id) }; 
    const updateDoc = {
      $set: {
        status: status,
      },
    };

    const result = await ebooksCollection.updateOne(filter, updateDoc);

    if (result.modifiedCount > 0) {
      res.send({ success: true, message: `Ebook status updated to ${status}` });
    } else {
      res.status(404).send({ error: "Ebook not found or no changes made" });
    }
  } catch (error) {
    res.status(500).send({ error: "Failed to update status" });
  }
});




app.get("/writer/sales-history", async (req, res) => {
  try {
    const { email } = req.query;
// console.log(email)
    if (!email) {
      return res.status(400).send({ error: "Email required" });
    }
    // console.log(email)

   
const sales = await purchasesCollection.aggregate([
  {
    $match: {
      writerEmail: email
    }
  },
  {
    $addFields: {
      bookObjectId: {
        $toObjectId: "$bookId"
      }
    }
  },
  {
    $lookup: {
      from: "ebooks",
      localField: "bookObjectId",
      foreignField: "_id",
      as: "ebook"
    }
  },
  {
    $unwind: "$ebook"
  },
  {
    $project: {
      _id: 1,
      readerEmail: "$userEmail",
      ebookTitle: "$ebook.title",
      price: "$amount",
      date: 1
    }
  },
  {
    $sort: {
      date: -1
    }
  }
]).toArray();


    
// console.log(sales,'sales data')
    res.send(sales);
  } catch (err) {
    // console.log(err);
    res.status(500).send({ error: "Failed to fetch sales history" });
  }
});


app.get("/writer/books", async (req, res) => {
  try {
    const { email } = req.query;
    // console.log(email)
    if (!email) {
      return res.status(400).send({ error: "Writer email is required" });
    }
    
  
    const query = { writerEmail: email }; 
    const result = await ebooksCollection.find(query).toArray();
    
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch writer's books" });
  }
});





app.delete("/ebooks/:id", verifySessionToken, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await ebooksCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 1) {
      res.send({ success: true, message: "Ebook deleted successfully" });
    } else {
      res.status(404).send({ error: "Ebook not found" });
    }
  } catch (error) {
    res.status(500).send({ error: "Failed to delete ebook" });
  }
});

app.get("/users", async (req, res) => {
  try {
    // if (req.user.role !== "admin") {
    //   return res.status(403).send({ error: "Forbidden" });
    // }

    const result = await usersCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch users" });
  }
});



app.get("/users", verifySessionToken, async (req, res) => {
  try {
    const result = await usersCollection.find().toArray();
    // console.log("Users Count:", result.length);
    res.send(result);
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "Failed to fetch users" });
  }
});






// admin

app.delete("/users/:id",  verifySessionToken, async (req, res) => {
  try {
    const id = req.params.id;

    const result = await usersCollection.deleteOne({
      _id: new ObjectId(id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      error: "Failed to delete user",
    });
  }
});


app.get("/admin/ebooks",  verifySessionToken, async (req, res) => {
  try {
    const ebooks = await ebooksCollection.find().toArray();
    res.send(ebooks);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch ebooks" });
  }
});





app.get("/admin/transactions", verifySessionToken, async (req, res) => {
  try {
    const transactions = await purchasesCollection
      .find()
      .sort({ date: -1 })
      .toArray();

    res.send(transactions);
  } catch (error) {
    res.status(500).send({ error: "Failed to fetch transactions" });
  }
});




app.post("/purchase", verifySessionToken,  async (req, res) => {
  try {
    const { writerEmail, amount, bookId } = req.body;


    const book = await ebooksCollection.findOne({
      _id: new ObjectId(bookId),
    });
console.log("BOOK DATA:", book);
console.log("BOOK ID:", bookId);
console.log("BOOK DATA:", book);
    const result = await purchasesCollection.insertOne({
      transactionId: new ObjectId().toString(),
      type: "purchase",
       userEmail: req.body.userEmail,
      writerEmail,
      amount,
      bookId,
    
    ebookName: book?.title || book?.ebookName,
writer: book?.author || book?.writerName,
coverImage: book?.coverImage || book?.image,

      date: new Date(),
    });
console.log(result,'result')
    res.send(result);
  } catch (error) {
    // console.log(error)
    res.status(500).send({ error: "Purchase failed" });
  }
});




// app.get("/reader/purchased-books", verifySessionToken, async (req, res) => {
//   try {
//     const books = await purchasesCollection.aggregate([
//       {
//         $match: {
//           userEmail: req.user.email
//         }
//       },
//       {
//         $lookup: {
//           from: "ebooks",
//           localField: "bookId",
//           foreignField: "_id",
//           as: "ebook"
//         }
//       },
//       {
//         $unwind: "$ebook"
//       },
//       {
//         $project: {
//           _id: 1,
//           purchaseDate: "$date",
//           title: "$ebook.title",
//           coverImage: "$ebook.coverImage",
//           author: "$ebook.author",
//           price: "$amount"
//         }
//       }
//     ]).toArray();

//     res.send(books);
//   } catch (error) {
//     res.status(500).send({ error: "Failed to fetch books" });
//   }
// });



app.get('/my-purchase/:userEmail',  async (req, res) => {
	// more secure way: token -> user email
	const email = req.params.userEmail
  // console.log({email})
	const query = { userEmail: email }
	const result = await purchasesCollection.find(query).toArray()
 
	res.send(result)
})



app.post("/bookmarks", async (req, res) => {
  try {
    const { userEmail, bookId } = req.body;

    const existing = await bookmarksCollection.findOne({
      userEmail,
      bookId,
    });

    if (existing) {
      return res.status(400).send({
        message: "Already bookmarked",
      });
    }

    const book = await ebooksCollection.findOne({
      _id: new ObjectId(bookId),
    });

    const result = await bookmarksCollection.insertOne({
      userEmail,
      bookId,
      title: book.title,
      author: book.author,
      image: book.image,
      price: book.price,
      createdAt: new Date(),
    });

    res.send(result);
  } catch (error) {
    // console.log(error);
    res.status(500).send({
      message: "Failed to bookmark ebook",
    });
  }
});




app.get("/bookmarks/:email",verifySessionToken, async (req, res) => {
  const email = req.params.email;

  const result = await bookmarksCollection.find({
    userEmail: email
  }).toArray();

  res.send(result);
});


app.delete("/bookmarks/:id",verifySessionToken,  async (req, res) => {
  try {
    const result = await bookmarksCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to remove bookmark",
    });
  }
});





app.get("/admin/stats", verifySessionToken, async (req, res) => {
  try {
    const [
      users,
      writers,
      totalEbooks,
      totalSold,
      revenueResult,
      monthlySales,
      genreData,
    ] = await Promise.all([
      usersCollection.countDocuments(),

      usersCollection.countDocuments({
        role: "writer",
      }),

      ebooksCollection.countDocuments(),

      purchasesCollection.countDocuments(),

      purchasesCollection
        .aggregate([
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $toDouble: "$amount",
                },
              },
            },
          },
        ])
        .toArray(),

      purchasesCollection
        .aggregate([
          {
            $group: {
              _id: {
                $month: "$date",
              },
              total: {
                $sum: {
                  $toDouble: "$amount",
                },
              },
            },
          },
          {
            $sort: {
              _id: 1,
            },
          },
        ])
        .toArray(),

      ebooksCollection
        .aggregate([
          {
            $group: {
              _id: "$genre",
              count: {
                $sum: 1,
              },
            },
          },
        ])
        .toArray(),
    ]);

    res.send({
      users,
      writers,
      totalEbooks,
      totalSold,
      revenue: revenueResult[0]?.total || 0,
      monthlySales,
      genreData,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      error: "Failed to load dashboard stats",
    });
  }
});



app.delete22("/bookmarks/:id",verifySessionToken,  async (req, res) => {
  try {
    const result = await bookmarksCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to remove bookmark",
    });
  }
});





 
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});



 


