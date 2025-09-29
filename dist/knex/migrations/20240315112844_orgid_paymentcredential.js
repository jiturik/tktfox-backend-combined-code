async function up(knex) {
  await knex.schema.alterTable("ms_payment_credential", (table) => {
    table.integer("org_id").nullable();
  });
}

async function down(knex) {
  await knex.schema.alterTable("ms_payment_credential", (table) => {
    table.dropColumn("org_id");
  });
}

export { down, up };
