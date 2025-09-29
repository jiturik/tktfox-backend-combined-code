async function up(knex) {
  await knex.schema.createTable("ms_scanned_tickets", (table) => {
    table.increments("scan_id").primary();
    table.integer("booking_id");
    table.string("booking_code");
    table.integer("scanned_by");
    table.integer("removed_by");
    table.enu("scan_is_active", ["Y", "N"]).defaultTo("Y");
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("ms_scanned_tickets");
}

export { down, up };
