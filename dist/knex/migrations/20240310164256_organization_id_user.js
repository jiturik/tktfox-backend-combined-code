async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.integer("org_id").nullable();
  });
  await knex.schema.alterTable("ms_event", (table) => {
    table.integer("org_id").nullable();
  });
  await knex.schema.alterTable("ms_genre", (table) => {
    table.integer("org_id").nullable();
  });
  await knex.schema.alterTable("ms_seat_class_type", (table) => {
    table.integer("org_id").nullable();
  });
  await knex.schema.alterTable("ms_countries", (table) => {
    table.integer("org_id").nullable();
  });
  await knex.schema.alterTable("ms_cities", (table) => {
    table.integer("org_id").nullable();
  });
  await knex.schema.alterTable("ms_currencies", (table) => {
    table.integer("org_id").nullable();
  });

  await knex.schema.alterTable("ms_languages", (table) => {
    table.integer("org_id").nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("org_id");
  });
  await knex.schema.alterTable("ms_event", (table) => {
    table.dropColumn("org_id");
  });
  await knex.schema.alterTable("ms_genre", (table) => {
    table.dropColumn("org_id");
  });
  await knex.schema.alterTable("ms_seat_class_type", (table) => {
    table.dropColumn("org_id");
  });
  await knex.schema.alterTable("ms_countries", (table) => {
    table.dropColumn("org_id");
  });
  await knex.schema.alterTable("ms_cities", (table) => {
    table.dropColumn("org_id");
  });
  await knex.schema.alterTable("ms_currencies", (table) => {
    table.dropColumn("org_id");
  });

  await knex.schema.alterTable("ms_languages", (table) => {
    table.dropColumn("org_id");
  });
}

export { down, up };
