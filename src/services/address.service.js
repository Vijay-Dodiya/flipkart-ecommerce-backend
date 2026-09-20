import prisma from "../config/prisma.js";

import AppError from "../utils/AppError.js";


/*
|--------------------------------------------------------------------------
| Helper: Make Address Default
|--------------------------------------------------------------------------
|
| A user can have only ONE default address.
|
| So before making an address default:
|
| 1. Remove default from all user's addresses.
| 2. Make the selected address default.
|
|--------------------------------------------------------------------------
*/

const setDefaultAddress = async (
    tx,
    userId,
    addressId
) => {

    await tx.addresses.updateMany({
        where: {
            user_id: userId,
            is_default: true,
        },
        data: {
            is_default: false,
        },
    });

    return tx.addresses.update({
        where: {
            id: addressId,
        },
        data: {
            is_default: true,
        },
    });
};


/*
|--------------------------------------------------------------------------
| Create Address
|--------------------------------------------------------------------------
*/

export const createAddress = async (
    userId,
    data
) => {

    return prisma.$transaction(async (tx) => {

        const {
            is_default = false,
            ...addressData
        } = data;


        /*
        |--------------------------------------------------------------------------
        | Check user's existing addresses
        |--------------------------------------------------------------------------
        |
        | If this is the user's first address,
        | automatically make it the default address.
        |
        */

        const addressCount = await tx.addresses.count({
            where: {
                user_id: userId,
            },
        });


        const shouldBeDefault =
            addressCount === 0 || is_default;


        /*
        |--------------------------------------------------------------------------
        | Create address
        |--------------------------------------------------------------------------
        |
        | Initially create it as non-default.
        | If it should be default, setDefaultAddress()
        | will handle the default-address logic.
        |
        */

        const address = await tx.addresses.create({
            data: {
                ...addressData,
                user_id: userId,
                is_default: false,
            },
        });


        /*
        |--------------------------------------------------------------------------
        | Make address default if required
        |--------------------------------------------------------------------------
        */

        if (shouldBeDefault) {

            return setDefaultAddress(
                tx,
                userId,
                address.id
            );
        }


        return address;
    });
};


/*
|--------------------------------------------------------------------------
| Get All Addresses
|--------------------------------------------------------------------------
*/

export const getMyAddresses = async (
    userId
) => {

    return prisma.addresses.findMany({
        where: {
            user_id: userId,
        },

        orderBy: [
            {
                is_default: "desc",
            },
            {
                created_at: "desc",
            },
        ],
    });
};


/*
|--------------------------------------------------------------------------
| Get Single Address
|--------------------------------------------------------------------------
*/

export const getMyAddressById = async (
    userId,
    addressId
) => {

    const address = await prisma.addresses.findFirst({
        where: {
            id: addressId,
            user_id: userId,
        },
    });


    if (!address) {

        throw new AppError(
            "Address not found",
            404
        );
    }


    return address;
};


/*
|--------------------------------------------------------------------------
| Update Address
|--------------------------------------------------------------------------
*/

export const updateAddress = async (
    userId,
    addressId,
    data
) => {

    return prisma.$transaction(async (tx) => {

        /*
        |--------------------------------------------------------------------------
        | Find existing address
        |--------------------------------------------------------------------------
        */

        const existingAddress =
            await tx.addresses.findFirst({

                where: {
                    id: addressId,
                    user_id: userId,
                },

            });


        if (!existingAddress) {

            throw new AppError(
                "Address not found",
                404
            );
        }


        const {
            is_default,
            ...updateData
        } = data;


        /*
        |--------------------------------------------------------------------------
        | If user wants this address to become default
        |--------------------------------------------------------------------------
        */

        if (is_default === true) {

            return setDefaultAddress(
                tx,
                userId,
                addressId
            ).then(async () => {

                return tx.addresses.update({

                    where: {
                        id: addressId,
                    },

                    data: updateData,

                });

            });
        }


        /*
        |--------------------------------------------------------------------------
        | Update address normally
        |--------------------------------------------------------------------------
        |
        | If this address is already the default address,
        | it remains default because is_default is not included
        | in updateData.
        |
        */

        return tx.addresses.update({

            where: {
                id: addressId,
            },

            data: {
                ...updateData,
            },

        });
    });
};


/*
|--------------------------------------------------------------------------
| Delete Address
|--------------------------------------------------------------------------
*/

export const deleteAddress = async (
    userId,
    addressId
) => {

    return prisma.$transaction(async (tx) => {

        /*
        |--------------------------------------------------------------------------
        | Find address and verify ownership
        |--------------------------------------------------------------------------
        */

        const address =
            await tx.addresses.findFirst({

                where: {
                    id: addressId,
                    user_id: userId,
                },

            });


        if (!address) {

            throw new AppError(
                "Address not found",
                404
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Delete the address
        |--------------------------------------------------------------------------
        */

        await tx.addresses.delete({
            where: {
                id: addressId,
            },
        });


        /*
        |--------------------------------------------------------------------------
        | If deleted address was default,
        | make another address default.
        |--------------------------------------------------------------------------
        */

        if (address.is_default) {

            const nextAddress =
                await tx.addresses.findFirst({

                    where: {
                        user_id: userId,
                    },

                    orderBy: {
                        created_at: "desc",
                    },

                });


            if (nextAddress) {

                await tx.addresses.update({

                    where: {
                        id: nextAddress.id,
                    },

                    data: {
                        is_default: true,
                    },

                });
            }
        }


        return {
            message: "Address deleted successfully",
        };
    });
};