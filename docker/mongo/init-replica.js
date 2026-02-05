// MongoDB Replica Set Initialization Script
// This script runs on first container start

print('═══════════════════════════════════════════════════════════════════════════');
print('KPOS - MongoDB Replica Set Initialization');
print('═══════════════════════════════════════════════════════════════════════════');

// Wait for MongoDB to be ready
sleep(2000);

// Check if replica set is already initialized
try {
    const status = rs.status();
    print('Replica set already initialized');
    print('Status: ' + status.ok);
} catch (e) {
    print('Initializing replica set...');

    // Initialize replica set with localhost for host machine access
    // This allows both Docker containers (via network alias) and host machine (via localhost) to connect
    rs.initiate({
        _id: 'rs0',
        members: [
            { _id: 0, host: 'localhost:27017' }
        ]
    });

    print('Replica set initialized successfully');
}

// Wait for replica set to be ready
sleep(3000);

// Switch to kpos_db
db = db.getSiblingDB('kpos_db');

// Create initial collections with validation
print('Creating collections...');

// Users collection
db.createCollection('users', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['email', 'password', 'role'],
            properties: {
                email: { bsonType: 'string' },
                password: { bsonType: 'string' },
                role: { bsonType: 'string' }
            }
        }
    }
});

// Create indexes
print('Creating indexes...');

db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ branchId: 1 });

db.products.createIndex({ barcode: 1 }, { unique: true, sparse: true });
db.products.createIndex({ sku: 1 }, { unique: true, sparse: true });
db.products.createIndex({ categoryId: 1 });
db.products.createIndex({ name: 'text' });

db.transactions.createIndex({ createdAt: -1 });
db.transactions.createIndex({ branchId: 1 });
db.transactions.createIndex({ staffId: 1 });

db.members.createIndex({ phone: 1 }, { unique: true, sparse: true });
db.members.createIndex({ email: 1 }, { sparse: true });
db.members.createIndex({ cardNumber: 1 }, { unique: true, sparse: true });

db.orders.createIndex({ tableId: 1 });
db.orders.createIndex({ status: 1 });
db.orders.createIndex({ createdAt: -1 });

db.activity_logs.createIndex({ createdAt: -1 });
db.activity_logs.createIndex({ userId: 1 });
db.activity_logs.createIndex({ action: 1 });

print('═══════════════════════════════════════════════════════════════════════════');
print('MongoDB initialization completed!');
print('═══════════════════════════════════════════════════════════════════════════');
