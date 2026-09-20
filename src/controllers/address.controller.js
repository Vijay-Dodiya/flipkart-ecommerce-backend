import {
    createAddress,
    getMyAddresses,
    getMyAddressById,
    updateAddress,
    deleteAddress,
} from "../services/address.service.js";


/*
|--------------------------------------------------------------------------
| Create Address
|--------------------------------------------------------------------------
*/

export const createAddressController = async (
    req,
    res
) => {

    const address = await createAddress(
        req.user.id,
        req.body
    );

    res.status(201).json({
        success: true,
        message: "Address created successfully",
        address,
    });
};


/*
|--------------------------------------------------------------------------
| Get All My Addresses
|--------------------------------------------------------------------------
*/

export const getMyAddressesController = async (
    req,
    res
) => {

    const addresses = await getMyAddresses(
        req.user.id
    );

    res.status(200).json({
        success: true,
        message: "Addresses fetched successfully",
        addresses,
    });
};


/*
|--------------------------------------------------------------------------
| Get Single Address
|--------------------------------------------------------------------------
*/

export const getMyAddressByIdController = async (
    req,
    res
) => {

    const { id } = req.params;

    const address = await getMyAddressById(
        req.user.id,
        id
    );

    res.status(200).json({
        success: true,
        message: "Address fetched successfully",
        address,
    });
};


/*
|--------------------------------------------------------------------------
| Update Address
|--------------------------------------------------------------------------
*/

export const updateAddressController = async (
    req,
    res
) => {

    const { id } = req.params;

    const address = await updateAddress(
        req.user.id,
        id,
        req.body
    );

    res.status(200).json({
        success: true,
        message: "Address updated successfully",
        address,
    });
};


/*
|--------------------------------------------------------------------------
| Delete Address
|--------------------------------------------------------------------------
*/

export const deleteAddressController = async (
    req,
    res
) => {

    const { id } = req.params;

    const result = await deleteAddress(
        req.user.id,
        id
    );

    res.status(200).json({
        success: true,
        ...result,
    });
};