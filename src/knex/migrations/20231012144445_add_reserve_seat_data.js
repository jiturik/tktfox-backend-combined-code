async function up(knex) {
  await knex.schema.createTable("ms_reservation", (table) => {
    table.increments("r_id").primary();
    table.string("reservation_id");
    table.integer("event_sch_id");
    table.integer("event_id");
    table.integer("seat_group_id");
    table.string("seat_name");
    table.string("seat_type");
    table.string("row_name");
    table.string("column_name");
    table.string("timezone_name");
    table.decimal("seat_price", 11, 4);
    table.enu("is_seat_layout_exist", ["Y", "N"]).defaultTo("N");
    table.enu("is_reserved", ["Y", "N"]).defaultTo("Y");
    table.enu("is_booked", ["Y", "N"]).defaultTo("N");
    table.integer("created_by").nullable();
    table.integer("updated_by").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at").defaultTo(knex.fn.now());
  });
}

async function down(knex) {
  await knex.schema.dropTable("ms_reservation");
}

export { down, up };
