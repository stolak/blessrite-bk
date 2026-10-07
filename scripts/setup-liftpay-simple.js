const { PrismaClient } = require('@prisma/client');
const mysql = require('mysql2/promise');

const prisma = new PrismaClient();

async function setupLiftPaySystem() {
  let connection;
  
  try {
    console.log('🚀 Starting LiftPay ID system setup...\n');

    // Get database connection details from Prisma
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not found in environment variables');
    }

    // Parse the database URL
    const url = new URL(databaseUrl);
    const config = {
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.substring(1),
      multipleStatements: true
    };

    console.log(`📡 Connecting to database: ${config.database}@${config.host}:${config.port}`);
    connection = await mysql.createConnection(config);

    // Step 1: Create sequence table
    console.log('📊 Creating liftpay_sequence table...');
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS liftpay_sequence (
        prefix VARCHAR(10) NOT NULL,
        \`year_month\` CHAR(4) NOT NULL,
        seq INT NOT NULL DEFAULT 100000,
        PRIMARY KEY (prefix, \`year_month\`)
      )
    `);
    console.log('✅ liftpay_sequence table created\n');

    // Step 2: Create LiftPay ID function
    console.log('🔧 Creating generate_liftpay_id function...');
    
    // Drop function if exists
    await connection.query(`DROP FUNCTION IF EXISTS generate_liftpay_id`);
    
    // Create function
    await connection.query(`
      CREATE FUNCTION generate_liftpay_id(p_prefix VARCHAR(10))
      RETURNS VARCHAR(30)
      BEGIN
        DECLARE v_year CHAR(2);
        DECLARE v_month CHAR(2);
        DECLARE v_yearmonth CHAR(4);
        DECLARE v_seq INT;
        DECLARE v_id VARCHAR(30);

        SET v_year = RIGHT(YEAR(CURDATE()), 2);
        SET v_month = LPAD(MONTH(CURDATE()), 2, '0');
        SET v_yearmonth = CONCAT(v_year, v_month);

        INSERT INTO liftpay_sequence (prefix, \`year_month\`, seq)
        VALUES (p_prefix, v_yearmonth, 100001)
        ON DUPLICATE KEY UPDATE seq = seq + 1;

        SELECT seq INTO v_seq FROM liftpay_sequence
        WHERE prefix = p_prefix AND \`year_month\` = v_yearmonth;

        SET v_id = CONCAT(p_prefix, '-', v_yearmonth, '-', v_seq);

        RETURN UPPER(v_id);
      END
    `);
    console.log('✅ generate_liftpay_id function created\n');

    // Step 3: Create triggers
    console.log('⚡ Creating database triggers...');
    
    // Drop existing triggers if they exist
    await connection.query(`DROP TRIGGER IF EXISTS trg_merchant_liftpay_id`);
    await connection.query(`DROP TRIGGER IF EXISTS trg_buyer_liftpay_id`);
    await connection.query(`DROP TRIGGER IF EXISTS trg_loan_liftpay_id`);
    await connection.query(`DROP TRIGGER IF EXISTS trg_loan_transaction_liftpay_id`);
    await connection.query(`DROP TRIGGER IF EXISTS trg_invoice_liftpay_id`);
    await connection.query(`DROP TRIGGER IF EXISTS trg_merchant_transaction_liftpay_id`);

    // Create Merchant trigger
    await connection.query(`
      CREATE TRIGGER trg_merchant_liftpay_id
      BEFORE INSERT ON Merchant
      FOR EACH ROW
      BEGIN
        IF NEW.liftpayId IS NULL OR NEW.liftpayId = '' THEN
          SET NEW.liftpayId = generate_liftpay_id('LPM');
        END IF;
      END
    `);
    console.log('✅ Merchant trigger created');

    // Create Buyer trigger
    await connection.query(`
      CREATE TRIGGER trg_buyer_liftpay_id
      BEFORE INSERT ON Buyer
      FOR EACH ROW
      BEGIN
        IF NEW.liftpayId IS NULL OR NEW.liftpayId = '' THEN
          SET NEW.liftpayId = generate_liftpay_id('LPB');
        END IF;
      END
    `);
    console.log('✅ Buyer trigger created\n');

    // Create Loan trigger
    await connection.query(`
      CREATE TRIGGER trg_loan_liftpay_id
      BEFORE INSERT ON Loan
      FOR EACH ROW
      BEGIN
        IF NEW.liftpayId IS NULL OR NEW.liftpayId = '' THEN
          SET NEW.liftpayId = generate_liftpay_id('LPL');
        END IF;
      END
    `);
    console.log('✅ Loan trigger created\n');

    // Create Loan Transaction trigger
    await connection.query(`
      CREATE TRIGGER trg_loan_transaction_liftpay_id
      BEFORE INSERT ON LoanTransaction
      FOR EACH ROW
      BEGIN
        IF NEW.liftpayId IS NULL OR NEW.liftpayId = '' THEN
          SET NEW.liftpayId = generate_liftpay_id('LPP');
        END IF;
      END
    `);
    console.log('✅ Loan Transaction trigger created');

    // Create Invoice trigger
    await connection.query(`
      CREATE TRIGGER trg_invoice_liftpay_id
      BEFORE INSERT ON Invoice
      FOR EACH ROW
      BEGIN
        IF NEW.liftpayId IS NULL OR NEW.liftpayId = '' THEN
          SET NEW.liftpayId = generate_liftpay_id('LPI');
        END IF;
      END
    `);
    console.log('✅ Invoice trigger created');

    // Create Merchant Transaction trigger
    await connection.query(`
      CREATE TRIGGER trg_merchant_transaction_liftpay_id
      BEFORE INSERT ON MerchantTransaction
      FOR EACH ROW
      BEGIN
        IF NEW.liftpayId IS NULL OR NEW.liftpayId = '' THEN
          SET NEW.liftpayId = generate_liftpay_id('LPP');
        END IF;
      END
    `);
    console.log('✅ Merchant Transaction trigger created\n');

    // Step 4: Test the function
    console.log('🧪 Testing LiftPay ID generation...');
    const [testMerchant] = await connection.execute(`SELECT generate_liftpay_id('LPM') as id`);
    const [testBuyer] = await connection.execute(`SELECT generate_liftpay_id('LPB') as id`);
    const [testLoan] = await connection.execute(`SELECT generate_liftpay_id('LPL') as id`);
    const [testLoanTransaction] = await connection.execute(`SELECT generate_liftpay_id('LPP') as id`);
    const [testInvoice] = await connection.execute(`SELECT generate_liftpay_id('LPI') as id`);
    // const [testMerchantTransaction] = await connection.execute(`SELECT generate_liftpay_id('LPMT') as id`);
    console.log(`✅ Test Merchant ID: ${testMerchant[0].id}`);
    console.log(`✅ Test Buyer ID: ${testBuyer[0].id}`);
    console.log(`✅ Test Loan ID: ${testLoan[0].id}`);
    console.log(`✅ Test Loan Transaction ID: ${testLoanTransaction[0].id}`);
    console.log(`✅ Test Invoice ID: ${testInvoice[0].id}`);
    // console.log(`✅ Test Merchant Transaction ID: ${testMerchantTransaction[0].id}\n`);

    // Step 5: Show statistics
    console.log('📈 Current sequence statistics:');
    const [stats] = await connection.execute(`
      SELECT prefix, \`year_month\`, seq FROM liftpay_sequence ORDER BY prefix, \`year_month\`
    `);
    
    if (stats.length > 0) {
      stats.forEach(stat => {
        console.log(`   ${stat.prefix} - ${stat.year_month}: ${stat.seq}`);
      });
    } else {
      console.log('   No sequences found');
    }

    console.log('\n🎉 LiftPay ID system setup completed successfully!');
    console.log('\n📋 Available prefixes:');
    console.log('   LPM  - LiftPay Merchant');
    console.log('   LPB  - LiftPay Buyer');
    console.log('   LPL  - LiftPay Loan');
    console.log('   LPP  - LiftPay Payment (Loan Transaction)');
    console.log('   LPI  - LiftPay Invoice');
    console.log('   LPMT - LiftPay Merchant Transaction');

  } catch (error) {
    console.error('❌ Error setting up LiftPay ID system:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
    await prisma.$disconnect();
  }
}

// Run the setup
setupLiftPaySystem()
  .then(() => {
    console.log('\n✅ All setup completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  });
