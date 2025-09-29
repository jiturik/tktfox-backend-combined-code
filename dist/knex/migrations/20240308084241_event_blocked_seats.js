async function up(knex) {
  await knex.schema.createTable("event_manual_blocked_seats", (table) => {
    table.increments("block_id").primary();
    table.integer("event_id");
    table.integer("event_sch_id");
    table.string("seat_name");
    table.string("seat_type");
    table.string("row_name");
    table.string("column_name");
    table.string("seat_group_id");
  });
}

async function down(knex) {
  await knex.schema.dropTable("event_manual_blocked_seats");
}

export { down, up };
