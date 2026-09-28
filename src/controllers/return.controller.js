import {
    createReturnRequest,
    getMyReturns,
    getMyReturnById,
    cancelReturnRequest,

    getAllReturns,
    getReturnById,

    approveReturn,
    rejectReturn,
    markReturnReceived,
    processReturnRefund,
} from "../services/return.service.js";


// ============================================================
// CUSTOMER
// ============================================================

export const createReturn = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await createReturnRequest(
                req.user.id,
                req.body
            );

        res.status(201).json({
            success: true,
            message:
                "Return request created successfully",
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


export const getMyReturnList = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await getMyReturns(
                req.user.id
            );

        res.json({
            success: true,
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


export const getMyReturn = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await getMyReturnById(
                req.user.id,
                req.params.returnId
            );

        res.json({
            success: true,
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


export const cancelReturn = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await cancelReturnRequest(
                req.user.id,
                req.params.returnId
            );

        res.json({
            success: true,
            message:
                "Return request cancelled successfully",
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


// ============================================================
// ADMIN
// ============================================================

export const getReturns = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await getAllReturns();

        res.json({
            success: true,
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


export const getReturn = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await getReturnById(
                req.params.returnId
            );

        res.json({
            success: true,
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


export const approve = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await approveReturn(
                req.user.id,
                req.params.returnId,
                req.body.adminNote
            );

        res.json({
            success: true,
            message:
                "Return approved successfully",
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


export const reject = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await rejectReturn(
                req.user.id,
                req.params.returnId,
                req.body.adminNote
            );

        res.json({
            success: true,
            message:
                "Return rejected successfully",
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


export const received = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await markReturnReceived(
                req.user.id,
                req.params.returnId,
                req.body.adminNote
            );

        res.json({
            success: true,
            message:
                "Returned item marked as received",
            data: result,
        });

    } catch (error) {
        next(error);
    }
};


export const refund = async (
    req,
    res,
    next
) => {

    try {

        const result =
            await processReturnRefund(
                req.params.returnId
            );

        res.json({
            success: true,
            message:
                "Return refund processed successfully",
            data: result,
        });

    } catch (error) {
        next(error);
    }
};