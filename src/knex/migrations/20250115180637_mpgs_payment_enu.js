export async function up(knex) {
  await knex.raw(
    `ALTER TABLE organization_setting 
    CHANGE setting_key setting_key enum('tap_pay_payment','payone_payment','seats_io','website_url','mpgs_network_payment') DEFAULT NULL;
    `
  );
}

export async function down(knex) {}
