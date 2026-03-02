const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Create SQLite database
const db = new sqlite3.Database('./billing.db');

// Create Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        phone TEXT,
        address TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        price REAL,
        quantity INTEGER,
        expiry_date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        total REAL,
        date TEXT
    )`);
});



db.run(`CREATE TABLE IF NOT EXISTS bill_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    price REAL
)`);


app.get('/products', (req, res) => {
    db.all(`SELECT * FROM products`, [], (err, rows) => {
        if (err) return res.send(err);
        res.json(rows);
    });
});

app.put('/updateProduct/:id', (req, res) => {
    const { name, price, quantity, expiry_date } = req.body;
    const id = req.params.id;

    db.run(`UPDATE products 
            SET name = ?, price = ?, quantity = ?, expiry_date = ?
            WHERE id = ?`,
        [name, price, quantity, expiry_date, id],
        function (err) {
            if (err) return res.send(err);
            res.send({ message: "Product Updated Successfully" });
        });
});

app.post('/createBill', (req, res) => {

    const { customer_name, phone, items } = req.body;
    const bill_date = new Date().toISOString();

    db.serialize(() => {

        // 1️⃣ Insert customer (or reuse if exists)
        db.get(`SELECT id FROM customers WHERE phone = ?`,
        [phone],
        (err, existingCustomer) => {

            if (existingCustomer) {
                createBill(existingCustomer.id);
            } else {
                db.run(`INSERT INTO customers (name, phone) VALUES (?, ?)`,
                [customer_name, phone],
                function() {
                    createBill(this.lastID);
                });
            }
        });

        function createBill(customerId) {

            let totalAmount = 0;

            // Check stock
            for (let item of items) {
                db.get(`SELECT quantity, price FROM products WHERE id = ?`,
                [item.product_id],
                (err, product) => {
                    if (!product || product.quantity < item.quantity) {
                        return res.send({ message: "Insufficient stock for product ID " + item.product_id });
                    }
                });
            }

            // Insert Bill
            db.run(`INSERT INTO bills (customer_id, total, bill_date)
                    VALUES (?, ?, ?)`,
            [customerId, 0, bill_date],
            function() {

                const billId = this.lastID;

                items.forEach(item => {

                    db.get(`SELECT price FROM products WHERE id = ?`,
                    [item.product_id],
                    (err, product) => {

                        const itemTotal = product.price * item.quantity;
                        totalAmount += itemTotal;

                        // Insert bill item
                        db.run(`INSERT INTO bill_items 
                                (bill_id, product_id, quantity, price)
                                VALUES (?, ?, ?, ?)`,
                        [billId, item.product_id, item.quantity, product.price]);

                        // Reduce stock
                        db.run(`UPDATE products 
                                SET quantity = quantity - ?
                                WHERE id = ?`,
                        [item.quantity, item.product_id]);
                    });
                });

                // Update total
                setTimeout(() => {
                    db.run(`UPDATE bills SET total = ? WHERE id = ?`,
                    [totalAmount, billId]);
                }, 500);

                res.send({ message: "Bill Created Successfully" });
            });
        }
    });
});

app.get("/customers", (req, res) => {
    db.all("SELECT * FROM customers ORDER BY id DESC", [], (err, rows) => {
        if (err) {
            return res.status(500).json(err);
        }
        res.json(rows);
    });
});

// CREATE
app.post("/customers", (req, res) => {
    const { name, phone, address } = req.body;

    db.run(
        "INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)",
        [name, phone, address],
        function(err) {
            if (err) return res.status(500).json(err);
            res.json({ id: this.lastID });
        }
    );
});

// UPDATE
app.put("/customers/:id", (req, res) => {
    const { name, phone, address } = req.body;
    const id = req.params.id;

    db.run(
        "UPDATE customers SET name=?, phone=?, address=? WHERE id=?",
        [name, phone, address, id],
        function(err) {
            if (err) return res.status(500).json(err);
            res.json({ message: "Updated" });
        }
    );
});

// DELETE
app.delete("/customers/:id", (req, res) => {
    db.run("DELETE FROM customers WHERE id=?", req.params.id, function(err) {
        if (err) return res.status(500).json(err);
        res.json({ message: "Deleted" });
    });
});

app.use(express.json());
app.use(express.static("public"));

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});