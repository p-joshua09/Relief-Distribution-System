const {createPool,migrate}=require('../server/database.cjs');
(async()=>{const pool=createPool();try{await migrate(pool);console.log('PostgreSQL schema is up to date.');}finally{await pool.end();}})().catch(error=>{console.error(error.message);process.exit(1);});
