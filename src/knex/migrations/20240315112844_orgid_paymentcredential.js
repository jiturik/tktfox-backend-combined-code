export async function up(knex) {
  await knex.schema.alterTable("ms_payment_credential", (table) => {
    table.integer("org_id").nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("ms_payment_credential", (table) => {
    table.dropColumn("org_id");
  });
}
