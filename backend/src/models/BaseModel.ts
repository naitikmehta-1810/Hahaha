import { Model, type FindOptions, type ModelStatic } from "sequelize";

/**
 * Shared Sequelize base for Stuffsy domain models.
 *
 * Isolation axis is seller_id / user_id — NOT a multi-tenant tenant_id.
 * This is a single-platform multi-seller marketplace, not a multi-tenant SaaS.
 *
 * Soft deletes (paranoid + deleted_at) are mandatory. Never hard-delete rows
 * that touch orders, payments, or inventory history.
 */
export abstract class BaseModel<
  // Sequelize Model generics historically used `{}`; keep that contract.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TModelAttributes extends {} = any,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  TCreationAttributes extends {} = TModelAttributes,
> extends Model<TModelAttributes, TCreationAttributes> {
  /**
   * Spread into Model.init() / sequelize.define() options so every table gets
   * snake_case columns, created_at / updated_at, and soft deletes.
   */
  static readonly defaultModelOptions = {
    paranoid: true,
    underscored: true,
    timestamps: true,
  } as const;

  /**
   * Scope queries to a seller (products, inventory, seller-owned resources).
   * Use on models that have a seller_id column.
   */
  static scopeToSeller<M extends BaseModel>(
    this: ModelStatic<M>,
    sellerId: string,
    options: FindOptions = {}
  ): FindOptions {
    const existingWhere = (options.where ?? {}) as Record<string, unknown>;
    return {
      ...options,
      where: {
        ...existingWhere,
        seller_id: sellerId,
      },
    };
  }

  /**
   * Scope queries to a user (carts, addresses, wishlists, reviews).
   * Use on models that have a user_id column.
   */
  static scopeToUser<M extends BaseModel>(
    this: ModelStatic<M>,
    userId: string,
    options: FindOptions = {}
  ): FindOptions {
    const existingWhere = (options.where ?? {}) as Record<string, unknown>;
    return {
      ...options,
      where: {
        ...existingWhere,
        user_id: userId,
      },
    };
  }
}
