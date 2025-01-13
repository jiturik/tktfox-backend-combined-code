async function up(knex) {
  await knex.raw(`
    ALTER TABLE ms_countries CHANGE country_name country_name1 VARCHAR(255);`);
  await knex.raw(`
ALTER TABLE ms_countries CHANGE country_code country_name VARCHAR(255);
`);
  await knex.raw(`
ALTER TABLE ms_countries CHANGE country_name1 country_code VARCHAR(255);`);
}

async function down(knex) {
  await knex("ms_countries").truncate();
}

export { down, up };
